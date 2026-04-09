const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { all, get } = require('../database');

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

// GET /api/my/appointments — patient's own appointments
router.get('/appointments', requireAuth, requireRole(['PATIENT']), async (req, res, next) => {
  try {
    const patientId = await resolveOwnPatientId(req.user.id);

    if (!patientId) {
      // No patient linkage found — return empty (honest) rather than leaking other records
      return res.json([]);
    }

    const encounters = await all(`
      SELECT e.id, e.phase, e.is_discharged, e.patient_id, p.name as patient_name
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      WHERE e.patient_id = ?
    `, [patientId]);

    const appointments = encounters.map((enc, i) => ({
      id: `apt-${enc.id}`,
      date: enc.is_discharged ? 'Oct 24, 2024' : 'Apr 10, 2026',
      time: `${9 + i}:${i === 0 ? '30' : '00'} AM`,
      doctor: 'Dr. S. Nair',
      specialty: 'General Medicine',
      status: enc.is_discharged ? 'COMPLETED' : 'UPCOMING',
      reason: `Encounter ${enc.id} — ${enc.phase}`,
      location: 'OPD Block B, Room 12'
    }));

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
      SELECT p.id, p.rx_content, p.status, p.authorizing_user_id, e.patient_id
      FROM prescriptions p
      JOIN encounters e ON p.encounter_id = e.id
      WHERE e.patient_id = ?
    `, [patientId]);

    const prescriptions = rxRows.map(rx => ({
      id: rx.id,
      medicine: rx.rx_content || 'Unnamed medication',
      dose: '500mg',
      frequency: 'As prescribed',
      prescribedBy: rx.authorizing_user_id || 'Pending authorization',
      refillDate: 'Apr 18, 2026',
      daysRemaining: 13,
      reminderEnabled: false,
      status: rx.status
    }));

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
      SELECT cn.id, cn.draft_content, cn.status, e.patient_id
      FROM clinical_notes cn
      JOIN encounters e ON cn.encounter_id = e.id
      WHERE e.patient_id = ?
    `, [patientId]);

    const records = noteRows.map(note => ({
      id: note.id,
      date: new Date().toISOString().split('T')[0],
      testName: `Clinical Note — ${note.id}`,
      status: note.status === 'FINALIZED' ? 'READY' : 'PROCESSING',
      category: 'lab',
      findings: note.status === 'FINALIZED' ? note.draft_content : undefined,
      requestedBy: 'Dr. S. Nair'
    }));

    res.json(records);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
