const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run, all } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const {
  normalizeQueueTransitionPhase,
  serializeQueueSlot,
  describeQueueIntegrityIssue,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const { logEvent } = require('../lib/logger');

const router = express.Router();

// GET QUEUE
router.get('/', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const rawQueue = await all(`
      SELECT e.id as encounter_id, e.patient_id, e.phase, e.lifecycle_status, e.is_discharged, e.__v,
             p.id AS patient_record_id, p.name, p.dob, p.gender
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE e.is_discharged = 0
      ORDER BY e.created_at ASC, e.id ASC
    `);

    const slots = [];
    const activeEncounterCounts = rawQueue.reduce((acc, row) => {
      const patientId = row.patient_id || 'UNKNOWN_PATIENT';
      acc.set(patientId, (acc.get(patientId) || 0) + 1);
      return acc;
    }, new Map());

    for (const row of rawQueue) {
      if ((activeEncounterCounts.get(row.patient_id || 'UNKNOWN_PATIENT') || 0) > 1) {
        logEvent('warn', 'queue_row_skipped', {
          correlationId: req.correlationId,
          ...describeQueueIntegrityIssue(row, ['duplicate_active_encounter'])
        });
        continue;
      }

      const serialized = serializeQueueSlot(row);
      if (serialized.warnings.length > 0) {
        logEvent('warn', 'queue_row_normalized', {
          correlationId: req.correlationId,
          ...describeQueueIntegrityIssue(row, serialized.warnings)
        });
      }

      if (!serialized.slot) {
        logEvent('warn', 'queue_row_skipped', {
          correlationId: req.correlationId,
          ...describeQueueIntegrityIssue(row, serialized.errors)
        });
        continue;
      }

      slots.push(serialized.slot);
    }

    res.json(slots);
  } catch (err) {
    next(err);
  }
});

router.patch('/:encounterId', requireAuth, requireRole(['NURSE', 'DOCTOR']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { phase, version } = req.body; // Client must provide the expected DB version

  if (!Number.isInteger(version)) {
    return next({ status: 400, code: 'MISSING_VERSION', message: 'Optimistic Concurrency Control requires version integer payload.' });
  }

  const normalizedPhase = normalizeQueueTransitionPhase(phase);
  if (!normalizedPhase) {
    return next({
      status: 422,
      code: 'INVALID_QUEUE_PHASE',
      message: 'Queue transitions accept only active phases. Use the discharge endpoint to close an encounter.'
    });
  }

  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Encounter missing.' });
    }

    const encounterState = validateEncounterLifecycle(encounter);
    if (!encounterState.valid) {
      return next({
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Encounter is malformed and cannot transition until repaired.',
        details: encounterState.errors
      });
    }

    if (encounter.__v !== version) {
      // 409 CONFLICT OCCURS HERE
      return next({ 
        status: 409, 
        code: 'STALE_STATE', 
        message: 'Queue state changed by another session. Please reload.' 
      });
    }

    // Attempt the guarded update, atomically incrementing version
    const result = await run(`
      UPDATE encounters
      SET phase = ?, lifecycle_status = ?, __v = __v + 1
      WHERE id = ? AND __v = ?
    `, [normalizedPhase, normalizedPhase, encounterId, version]);

    if (result.changes === 0) {
      return next({
        status: 409,
        code: 'STALE_STATE',
        message: 'Queue state changed by another session. Please reload.'
      });
    }

    // Deterministic audit log — written before response
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `QUEUE_TRANSITION:${encounter.phase}->${normalizedPhase}`,
      prior_state: JSON.stringify({ phase: encounter.phase, lifecycle_status: encounter.lifecycle_status, version }),
      new_state: JSON.stringify({ phase: normalizedPhase, lifecycle_status: normalizedPhase, version: version + 1 })
    });

    res.json({ message: 'Queue updated successfully', newVersion: version + 1 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
