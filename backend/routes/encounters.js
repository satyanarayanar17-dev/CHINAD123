const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run, all } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');

const router = express.Router();

const BREAK_GLASS_MIN_LENGTH = 50;

router.get('/:encounterId', requireAuth, async (req, res, next) => {
  try {
    const encounter = await get(
      `SELECT e.*, p.name as patient_name FROM encounters e JOIN patients p ON e.patient_id = p.id WHERE e.id = ?`,
      [req.params.encounterId]
    );
    if (!encounter) return next({ status: 404, code: 'NOT_FOUND' });
    res.json(encounter);
  } catch (err) { next(err); }
});

/**
 * BREAK-GLASS: Emergency access override with immutable audit.
 * Minimum justification raised to 50 characters for compliance.
 */
router.post('/:encounterId/break-glass', requireAuth, requireRole(['DOCTOR', 'NURSE']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { justification } = req.body;

  if (!justification || justification.trim().length < BREAK_GLASS_MIN_LENGTH) {
    return next({
      status: 400,
      code: 'INSUFFICIENT_JUSTIFICATION',
      message: `Break-glass requires a clinical justification of at least ${BREAK_GLASS_MIN_LENGTH} characters.`
    });
  }

  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) return next({ status: 404, code: 'NOT_FOUND' });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `BREAK_GLASS:${encounterId}:reason:${justification.substring(0, 200)}`
    });

    // Notify admin of break-glass event
    const patient = await get(`SELECT name FROM patients WHERE id = ?`, [encounter.patient_id]);
    await writeNotification({
      type: 'critical',
      title: '⚠️ Break-Glass Override Used',
      body: `${req.user.id} invoked emergency override for ${patient?.name || encounter.patient_id}: "${justification.substring(0, 80)}"`,
      patient_id: encounter.patient_id,
      actor_id: req.user.id,
      target_role: 'ADMIN'
    });

    res.json({
      granted: true,
      message: 'Emergency access granted. All actions are being recorded.',
      encounterId,
      actor: req.user.id,
      timestamp: new Date().toISOString()
    });
  } catch (err) { next(err); }
});

router.patch('/:encounterId/discharge', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { encounterId } = req.params;
  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) return next({ status: 404, code: 'NOT_FOUND' });
    if (encounter.is_discharged) return next({ status: 422, code: 'INVALID_STATE', message: 'Encounter is already discharged.' });

    const activeNotes = await all(
      `SELECT id FROM clinical_notes WHERE encounter_id = ? AND status != 'FINALIZED'`,
      [encounterId]
    );
    if (activeNotes.length > 0) {
      return next({ status: 409, code: 'STATE_CONFLICT', message: 'Cannot discharge. Active note drafts must be finalized or discarded.' });
    }

    const activeRx = await all(
      `SELECT id FROM prescriptions WHERE encounter_id = ? AND status != 'AUTHORIZED'`,
      [encounterId]
    );
    if (activeRx.length > 0) {
      return next({ status: 409, code: 'STATE_CONFLICT', message: 'Cannot discharge. Active prescription drafts must be authorized or discarded.' });
    }

    await run(
      `UPDATE encounters SET is_discharged = 1, phase = 'CLOSED', __v = __v + 1 WHERE id = ?`,
      [encounterId]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `DISCHARGE:${encounter.phase}->CLOSED`
    });

    // Phase 2: Notify admin of discharge
    const patient = await get(`SELECT name FROM patients WHERE id = ?`, [encounter.patient_id]);
    await writeNotification({
      type: 'info',
      title: 'Patient Discharged',
      body: `${patient?.name || encounter.patient_id} has been discharged by ${req.user.id}.`,
      patient_id: encounter.patient_id,
      actor_id: req.user.id,
      target_role: 'ADMIN'
    });

    res.json({ message: 'Patient discharged successfully', phase: 'CLOSED' });
  } catch (err) { next(err); }
});

module.exports = router;
