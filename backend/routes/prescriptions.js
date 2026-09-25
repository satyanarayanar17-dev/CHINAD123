const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run, all } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');
const {
  normalizePrescriptionStatus,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const {
  assertPatientRecord,
  assertDoctorAssignment,
  loadPatientRecord,
  resolveSingleActiveEncounter
} = require('../lib/careFlow');

const router = express.Router();
const DISPENSING_NOTE_MAX_LENGTH = 300;

function assertOperationalPrescriptionVisibility(rx) {
  if (rx.status !== 'AUTHORIZED') {
    throw {
      status: 403,
      code: 'PRESCRIPTION_VISIBILITY_RESTRICTED',
      message: 'Only authorized prescriptions are available to operational staff.'
    };
  }

  return rx;
}

async function loadPrescriptionWithContext(rxId) {
  const rx = await get(
    `SELECT p.*, e.patient_id, e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged, e.assigned_doctor_id, pt.id AS linked_patient_record_id
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
    lifecycle_status: rx.lifecycle_status,
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
    if (req.user.role === 'DOCTOR') {
      assertDoctorAssignment(rx, req.user.id);
    } else {
      assertOperationalPrescriptionVisibility(rx);
    }
    res.json(rx);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId, rx_content } = req.body;
  if (!patientId) return next({ status: 400, code: 'MISSING_PATIENT_ID' });
  try {
    const patient = await loadPatientRecord({ get }, patientId);
    assertPatientRecord(patient);

    const encounter = await resolveSingleActiveEncounter({ all }, patientId, {
      missingMessage: 'Patient lacks an active encounter for prescription.',
      malformedMessage: 'Active encounter is malformed and cannot accept prescriptions.',
      duplicateMessage: 'Multiple active encounters exist for this patient. Repair the data before writing prescriptions.'
    });
    assertDoctorAssignment(encounter, req.user.id);
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
    assertDoctorAssignment(rx, req.user.id);
    if (rx.status === 'AUTHORIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Cannot edit an authorized prescription.' });
    if (rx.__v !== version) return next({ status: 409, code: 'STALE_STATE', message: 'Prescription conflict detected.' });
    const updateResult = await run(
      `UPDATE prescriptions SET rx_content = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [rx_content, rxId, version]
    );
    if (updateResult.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Prescription conflict detected.' });
    }
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
    assertDoctorAssignment(rx, req.user.id);
    if (rx.status === 'AUTHORIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Prescription already authorized.' });
    if (rx.__v !== version) return next({ status: 409, code: 'STALE_STATE' });

    const authorizeResult = await run(
      `UPDATE prescriptions SET status = 'AUTHORIZED', authorizing_user_id = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [doctorId, rxId, version]
    );
    if (authorizeResult.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Prescription conflict detected.' });
    }

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

router.post('/:rxId/handover', requireAuth, requireRole(['NURSE', 'ADMIN']), async (req, res, next) => {
  const { rxId } = req.params;
  const rawDispensingNote = typeof req.body?.dispensing_note === 'string' ? req.body.dispensing_note.trim() : '';

  if (rawDispensingNote.length > DISPENSING_NOTE_MAX_LENGTH) {
    return next({
      status: 400,
      code: 'DISPENSING_NOTE_TOO_LONG',
      message: `Dispensing note must be ${DISPENSING_NOTE_MAX_LENGTH} characters or fewer.`
    });
  }

  try {
    const { rx, error } = await loadPrescriptionWithContext(rxId);
    if (error) return next(error);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found.' });
    assertOperationalPrescriptionVisibility(rx);

    if (rx.handed_over_at) {
      return next({
        status: 422,
        code: 'PRESCRIPTION_ALREADY_HANDED_OVER',
        message: 'This prescription has already been marked as handed over.'
      });
    }

    await run(
      `UPDATE prescriptions
       SET handed_over_by = ?, handed_over_at = CURRENT_TIMESTAMP, dispensing_note = ?
       WHERE id = ?`,
      [req.user.id, rawDispensingNote || null, rxId]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: rx.patient_id,
      action: `RX_HANDOVER:${rxId}:by:${req.user.id}`,
      new_state: JSON.stringify({
        handed_over_by: req.user.id,
        dispensing_note: rawDispensingNote || null
      })
    });

    res.json({
      message: 'Prescription marked as handed over.',
      handed_over_by: req.user.id,
      dispensing_note: rawDispensingNote || null
    });
  } catch (err) { next(err); }
});

module.exports = router;
