const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');
const {
  normalizePrescriptionStatus,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');

const router = express.Router();

async function loadPrescriptionWithContext(rxId) {
  const rx = await get(
    `SELECT p.*, e.patient_id, e.phase AS encounter_phase, e.is_discharged, pt.id AS linked_patient_record_id
     FROM prescriptions p
     LEFT JOIN encounters e ON p.encounter_id = e.id
     LEFT JOIN patients pt ON pt.id = e.patient_id
     WHERE p.id = ?`,
    [rxId]
  );

  if (!rx) {
    return { rx: null, error: null };
  }

  const normalizedStatus = normalizePrescriptionStatus(rx.status);
  if (!rx.patient_id || !rx.linked_patient_record_id || !normalizedStatus) {
    return {
      rx,
      error: {
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Prescription is linked to invalid encounter data.'
      }
    };
  }

  const encounterState = validateEncounterLifecycle({
    patient_id: rx.patient_id,
    phase: rx.encounter_phase,
    is_discharged: rx.is_discharged
  });

  if (!encounterState.valid) {
    return {
      rx,
      error: {
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Prescription is linked to a malformed encounter.',
        details: encounterState.errors
      }
    };
  }

  rx.status = normalizedStatus;
  return { rx, error: null };
}

router.get('/:rxId', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const { rx, error } = await loadPrescriptionWithContext(req.params.rxId);
    if (error) return next(error);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found.' });
    res.json(rx);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId, rx_content } = req.body;
  if (!patientId) return next({ status: 400, code: 'MISSING_PATIENT_ID' });
  try {
    const patient = await get(`SELECT id FROM patients WHERE id = ?`, [patientId]);
    if (!patient) return next({ status: 404, code: 'PATIENT_NOT_FOUND', message: 'Patient not found.' });

    const encounter = await get(
      `SELECT id, patient_id, phase, is_discharged
       FROM encounters
       WHERE patient_id = ? AND is_discharged = 0
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [patientId]
    );
    if (!encounter) return next({ status: 422, code: 'NO_ACTIVE_ENCOUNTER', message: 'Patient lacks an active encounter for prescription.' });
    const encounterState = validateEncounterLifecycle(encounter);
    if (!encounterState.valid) {
      return next({
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Active encounter is malformed and cannot accept prescriptions.',
        details: encounterState.errors
      });
    }
    const rxId = `rx-${Date.now()}`;
    await run(
      `INSERT INTO prescriptions (id, encounter_id, rx_content, status, __v) VALUES (?, ?, ?, 'DRAFT', 1)`,
      [rxId, encounter.id, rx_content || '']
    );
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patientId,
      action: `RX_CREATE:${rxId}`,
      new_state: JSON.stringify({ rx_id: rxId, encounter_id: encounter.id, version: 1 })
    });
    res.json({ rxId, newVersion: 1 });
  } catch (err) { next(err); }
});

router.put('/:rxId', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { rxId } = req.params;
  const { rx_content, version } = req.body;
  if (!Number.isInteger(version)) return next({ status: 400, code: 'MISSING_VERSION' });
  try {
    const { rx, error } = await loadPrescriptionWithContext(rxId);
    if (error) return next(error);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND' });
    if (rx.status === 'AUTHORIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Cannot edit an authorized prescription.' });
    if (rx.__v !== version) return next({ status: 409, code: 'STALE_STATE', message: 'Prescription conflict detected.' });
    await run(
      `UPDATE prescriptions SET rx_content = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [rx_content, rxId, version]
    );
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: rx.patient_id || null,
      action: `RX_SAVE:${rxId}`,
      new_state: JSON.stringify({ rx_id: rxId, version: version + 1 })
    });
    res.json({ message: 'Prescription saved', newVersion: version + 1 });
  } catch (err) { next(err); }
});

router.post('/:rxId/authorize', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { rxId } = req.params;
  const { version } = req.body;
  const doctorId = req.user.id;
  if (!Number.isInteger(version)) return next({ status: 400, code: 'MISSING_VERSION' });
  try {
    const { rx, error } = await loadPrescriptionWithContext(rxId);
    if (error) return next(error);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND' });
    if (rx.status === 'AUTHORIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Prescription already authorized.' });
    if (rx.__v !== version) return next({ status: 409, code: 'STALE_STATE' });

    await run(
      `UPDATE prescriptions SET status = 'AUTHORIZED', authorizing_user_id = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [doctorId, rxId, version]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: rx.patient_id,
      action: `RX_AUTHORIZE:${rxId}:by:${doctorId}`,
      new_state: JSON.stringify({ rx_id: rxId, version: version + 1, status: 'AUTHORIZED' })
    });

    // Phase 2: Notify nursing staff that a prescription is ready
    const patient = await get(`SELECT name FROM patients WHERE id = ?`, [rx.patient_id]);
    await writeNotification({
      type: 'info',
      title: 'Prescription Authorized',
      body: `Prescription for ${patient?.name || rx.patient_id} has been authorized by ${doctorId}.`,
      patient_id: rx.patient_id,
      actor_id: req.user.id,
      target_role: 'NURSE'
    });

    res.json({ message: 'Prescription officially authorized' });
  } catch (err) { next(err); }
});

module.exports = router;
