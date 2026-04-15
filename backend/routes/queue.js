const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run, all, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');
const {
  normalizeQueueTransitionPhase,
  normalizeTriagePriority,
  serializeQueueSlot,
  describeQueueIntegrityIssue,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const {
  assertDoctorAssignment,
  assertPatientRecord,
  ensureActiveEncounter,
  loadPatientRecord
} = require('../lib/careFlow');
const { logEvent } = require('../lib/logger');

const router = express.Router();

function parseFiniteNumber(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateTriageVitals(rawVitals) {
  const vitals = rawVitals && typeof rawVitals === 'object' ? rawVitals : {};
  const normalized = {
    height: parseFiniteNumber(vitals.height),
    weight: parseFiniteNumber(vitals.weight),
    systolic: parseFiniteNumber(vitals.systolic),
    diastolic: parseFiniteNumber(vitals.diastolic),
    hr: parseFiniteNumber(vitals.hr),
    temp: parseFiniteNumber(vitals.temp),
    spo2: parseFiniteNumber(vitals.spo2)
  };

  const missingFields = Object.entries(normalized)
    .filter(([, value]) => !Number.isFinite(value) || Number(value) <= 0)
    .map(([key]) => key);

  return {
    valid: missingFields.length === 0,
    vitals: normalized,
    missingFields
  };
}

function buildQueueScope(req) {
  if (req.user.role === 'DOCTOR') {
    return {
      whereClause: `WHERE e.is_discharged = 0 AND e.assigned_doctor_id = ?`,
      params: [req.user.id]
    };
  }

  return {
    whereClause: `WHERE e.is_discharged = 0`,
    params: []
  };
}

// GET QUEUE
router.get('/', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const scope = buildQueueScope(req);
    const rawQueue = await all(
      `
      SELECT e.id as encounter_id, e.patient_id, e.phase, e.lifecycle_status, e.is_discharged, e.__v,
             e.assigned_doctor_id, e.chief_complaint, e.triage_priority, e.handoff_notes,
             e.triage_vitals_json, e.triaged_by, e.triaged_at,
             p.id AS patient_record_id, p.name, p.dob, p.gender, p.phone,
             d.name AS assigned_doctor_name, d.is_active AS assigned_doctor_active
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN users d ON e.assigned_doctor_id = d.id
      ${scope.whereClause}
      ORDER BY e.created_at ASC, e.id ASC
    `,
      scope.params
    );

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

router.get('/doctors', requireAuth, requireRole(['NURSE', 'ADMIN', 'DOCTOR']), async (req, res, next) => {
  try {
    const doctors = await all(
      `
      SELECT u.id, u.name, u.is_active, COUNT(e.id) AS active_queue_count
      FROM users u
      LEFT JOIN encounters e
        ON e.assigned_doctor_id = u.id
       AND e.is_discharged = 0
      WHERE u.role = 'DOCTOR' AND u.is_active = 1
      GROUP BY u.id, u.name, u.is_active
      ORDER BY u.name ASC
    `
    );

    res.json(doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      is_active: doctor.is_active,
      active_queue_count: Number(doctor.active_queue_count || 0)
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/handoff', requireAuth, requireRole(['NURSE']), async (req, res, next) => {
  const {
    patientId,
    doctorId,
    chiefComplaint,
    triagePriority,
    handoffNotes,
    vitals
  } = req.body || {};

  if (!patientId) {
    return next({ status: 400, code: 'MISSING_PATIENT_ID', message: 'A patient must be selected before handoff.' });
  }

  if (!doctorId) {
    return next({ status: 400, code: 'DOCTOR_SELECTION_REQUIRED', message: 'A doctor must be selected before handoff.' });
  }

  if (typeof chiefComplaint !== 'string' || chiefComplaint.trim().length < 3) {
    return next({
      status: 400,
      code: 'CHIEF_COMPLAINT_REQUIRED',
      message: 'Chief complaint is required before handoff.'
    });
  }

  const normalizedPriority = normalizeTriagePriority(triagePriority);
  if (!normalizedPriority) {
    return next({
      status: 400,
      code: 'TRIAGE_PRIORITY_REQUIRED',
      message: 'A valid triage priority is required before handoff.'
    });
  }

  const vitalsValidation = validateTriageVitals(vitals);
  if (!vitalsValidation.valid) {
    return next({
      status: 400,
      code: 'TRIAGE_VITALS_REQUIRED',
      message: 'Complete vitals are required before handoff.',
      details: vitalsValidation.missingFields
    });
  }

  try {
    const { patient, encounter, doctor } = await withTransaction(async (tx) => {
      const patientRecord = await loadPatientRecord(tx, patientId);
      assertPatientRecord(patientRecord);

      const assignedDoctor = await tx.get(
        `SELECT id, name, role, is_active
         FROM users
         WHERE id = ?`,
        [doctorId]
      );

      if (!assignedDoctor || assignedDoctor.role !== 'DOCTOR') {
        throw {
          status: 404,
          code: 'DOCTOR_NOT_FOUND',
          message: 'Selected doctor could not be found.'
        };
      }

      if (assignedDoctor.is_active !== 1) {
        throw {
          status: 422,
          code: 'DOCTOR_UNAVAILABLE',
          message: 'Selected doctor is currently unavailable for assignment.'
        };
      }

      const ensuredEncounter = await ensureActiveEncounter(tx, patientId, {
        encounterId: `enc-${Date.now()}`
      });

      if (ensuredEncounter.encounter.lifecycle_status === 'IN_CONSULTATION') {
        throw {
          status: 422,
          code: 'ENCOUNTER_ALREADY_IN_CONSULTATION',
          message: 'This patient is already in consultation and cannot be re-triaged.'
        };
      }

      await tx.run(
        `
        UPDATE encounters
        SET assigned_doctor_id = ?,
            chief_complaint = ?,
            triage_priority = ?,
            handoff_notes = ?,
            triage_vitals_json = ?,
            triaged_by = ?,
            triaged_at = CURRENT_TIMESTAMP,
            phase = 'AWAITING',
            lifecycle_status = 'AWAITING',
            __v = __v + 1
        WHERE id = ?
      `,
        [
          assignedDoctor.id,
          chiefComplaint.trim(),
          normalizedPriority,
          typeof handoffNotes === 'string' && handoffNotes.trim().length > 0 ? handoffNotes.trim() : null,
          JSON.stringify(vitalsValidation.vitals),
          req.user.id,
          ensuredEncounter.encounter.id
        ]
      );

      return {
        patient: patientRecord,
        encounter: ensuredEncounter.encounter,
        doctor: assignedDoctor
      };
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patient.id,
      action: `TRIAGE_HANDOFF:${encounter.id}:to:${doctor.id}`,
      new_state: JSON.stringify({
        encounter_id: encounter.id,
        assigned_doctor_id: doctor.id,
        triage_priority: normalizedPriority
      })
    });

    await writeNotification({
      type: 'info',
      title: 'New Nurse Handoff',
      body: `${patient.name} has been assigned to ${doctor.name} from nurse triage.`,
      patient_id: patient.id,
      actor_id: req.user.id,
      target_role: 'DOCTOR',
      target_user_id: doctor.id
    });

    res.json({
      message: 'Patient handed off to doctor successfully.',
      encounterId: encounter.id,
      patientId: patient.id,
      assignedDoctor: {
        id: doctor.id,
        name: doctor.name
      }
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:encounterId', requireAuth, requireRole(['NURSE', 'DOCTOR']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { phase, version } = req.body;

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

    if (req.user.role === 'DOCTOR') {
      assertDoctorAssignment(encounter, req.user.id);
    }

    if (encounter.__v !== version) {
      return next({
        status: 409,
        code: 'STALE_STATE',
        message: 'Queue state changed by another session. Please reload.'
      });
    }

    const result = await run(
      `
      UPDATE encounters
      SET phase = ?, lifecycle_status = ?, __v = __v + 1
      WHERE id = ? AND __v = ?
    `,
      [normalizedPhase, normalizedPhase, encounterId, version]
    );

    if (result.changes === 0) {
      return next({
        status: 409,
        code: 'STALE_STATE',
        message: 'Queue state changed by another session. Please reload.'
      });
    }

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
