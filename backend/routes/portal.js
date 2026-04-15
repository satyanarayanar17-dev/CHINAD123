const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { all, get } = require('../database');
const {
  normalizeNoteStatus,
  normalizePrescriptionStatus,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const { logEvent } = require('../lib/logger');

const router = express.Router();

/**
 * Patient Portal Self-Service Routes
 * 
 * These routes require PATIENT role and scope all reads through the
 * patient_id linkage stored on the authenticated user record.
 * 
 * Patient scope: data is strictly scoped to the patient_id stored in the
 * users table under the column `patient_id`. If that column is absent for
 * a given user, no data is returned (empty arrays — not an error).
 *
 * NOTE: The old `resolvePatientIds()` function that returned ALL patient_ids
 * has been REMOVED. It was a trust boundary breach (BL-006).
 */

// Helper: resolve the single patient_id for the logged-in PATIENT user.
async function resolveOwnPatientId(userId) {
  const userRow = await get(`SELECT patient_id FROM users WHERE id = ?`, [userId]);
  if (!userRow) return null;
  return userRow.patient_id || null;
}

function summarizePrescription(rawContent) {
  if (!rawContent) {
    return 'Medication on file';
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (Array.isArray(parsed.newRx) && parsed.newRx.length > 0) {
      return parsed.newRx.map((item) => item.name).filter(Boolean).join(', ') || 'Medication on file';
    }
  } catch (_) {
    // Fall through to raw content.
  }

  return rawContent;
}

function summarizeNote(rawContent) {
  if (!rawContent) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.soap) {
      return [parsed.soap.S, parsed.soap.A, parsed.soap.P].filter(Boolean).join(' | ') || rawContent;
    }
  } catch (_) {
    // Fall through to raw content.
  }

  return rawContent;
}

// GET /api/my/appointments — patient's own appointments
router.get('/appointments', requireAuth, requireRole(['PATIENT']), async (req, res, next) => {
  try {
    const patientId = await resolveOwnPatientId(req.user.id);

    if (!patientId) {
      // No patient linkage found — return empty (honest) rather than leaking other records
      return res.json([]);
    }

    const encounters = await all(`
      SELECT e.id, e.phase, e.lifecycle_status, e.is_discharged, e.patient_id, e.created_at, p.name as patient_name
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      WHERE e.patient_id = ?
      ORDER BY e.created_at DESC, e.id DESC
    `, [patientId]);

    const appointments = encounters.flatMap((enc, i) => {
      const encounterState = validateEncounterLifecycle(enc);
      if (!encounterState.valid) {
        logEvent('warn', 'portal_appointment_skipped', {
          correlationId: req.correlationId,
          patientId,
          encounterId: enc.id,
          reasons: encounterState.errors
        });
        return [];
      }

      const visitDate = enc.created_at ? new Date(enc.created_at) : new Date();
      return [{
        id: `apt-${enc.id}`,
        date: visitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: visitDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        doctor: 'Assigned Care Team',
        specialty: 'General Medicine',
        status: enc.is_discharged ? 'COMPLETED' : 'UPCOMING',
        reason: `Encounter ${enc.id} — ${enc.lifecycle_status}`,
        location: 'Chettinad Care OPD'
      }];
    });

    res.json(appointments);
  } catch (err) {
    next(err);
  }
});

// GET /api/my/prescriptions — patient's own prescriptions (scoped)
router.get('/prescriptions', requireAuth, requireRole(['PATIENT']), async (req, res, next) => {
  try {
    const patientId = await resolveOwnPatientId(req.user.id);

    if (!patientId) {
      return res.json([]);
    }

    const rxRows = await all(`
      SELECT p.id, p.rx_content, p.status, p.authorizing_user_id, p.created_at,
             e.patient_id, e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged
      FROM prescriptions p
      JOIN encounters e ON p.encounter_id = e.id
      WHERE e.patient_id = ? AND p.status = 'AUTHORIZED'
      ORDER BY p.created_at DESC, p.id DESC
    `, [patientId]);

    const prescriptions = rxRows.flatMap((rx) => {
      const encounterState = validateEncounterLifecycle({
        patient_id: rx.patient_id,
        phase: rx.encounter_phase,
        lifecycle_status: rx.lifecycle_status,
        is_discharged: rx.is_discharged
      });
      const normalizedStatus = normalizePrescriptionStatus(rx.status);

      if (!encounterState.valid || normalizedStatus !== 'AUTHORIZED') {
        logEvent('warn', 'portal_prescription_skipped', {
          correlationId: req.correlationId,
          patientId,
          prescriptionId: rx.id,
          reasons: encounterState.valid ? ['non_authorized_prescription_hidden'] : encounterState.errors
        });
        return [];
      }

      return [{
        id: rx.id,
        medicine: summarizePrescription(rx.rx_content),
        dose: 'As prescribed',
        frequency: 'Follow care team instructions',
        prescribedBy: rx.authorizing_user_id || 'Authorized physician',
        refillDate: rx.created_at
          ? new Date(rx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'Check with care team',
        daysRemaining: 30,
        reminderEnabled: false,
        status: normalizedStatus
      }];
    });

    res.json(prescriptions);
  } catch (err) {
    next(err);
  }
});

// GET /api/my/records — patient's own clinical records (scoped)
router.get('/records', requireAuth, requireRole(['PATIENT']), async (req, res, next) => {
  try {
    const patientId = await resolveOwnPatientId(req.user.id);

    if (!patientId) {
      return res.json([]);
    }

    const noteRows = await all(`
      SELECT cn.id, cn.draft_content, cn.status, cn.author_id, cn.created_at,
             e.patient_id, e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged
      FROM clinical_notes cn
      JOIN encounters e ON cn.encounter_id = e.id
      WHERE e.patient_id = ?
      ORDER BY cn.created_at DESC, cn.id DESC
    `, [patientId]);

    const records = noteRows.flatMap((note) => {
      const encounterState = validateEncounterLifecycle({
        patient_id: note.patient_id,
        phase: note.encounter_phase,
        lifecycle_status: note.lifecycle_status,
        is_discharged: note.is_discharged
      });
      const normalizedStatus = normalizeNoteStatus(note.status);

      if (!encounterState.valid || normalizedStatus !== 'FINALIZED') {
        logEvent('warn', 'portal_record_skipped', {
          correlationId: req.correlationId,
          patientId,
          noteId: note.id,
          reasons: encounterState.valid ? ['non_finalized_note_hidden'] : encounterState.errors
        });
        return [];
      }

      return [{
        id: note.id,
        date: note.created_at
          ? new Date(note.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        testName: `Clinical Note — ${note.id}`,
        status: 'READY',
        category: 'lab',
        findings: summarizeNote(note.draft_content),
        requestedBy: note.author_id || 'Attending Physician'
      }];
    });

    res.json(records);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
