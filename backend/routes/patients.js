const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all } = require('../database');

const router = express.Router();

// GET /api/patients?q=search_term — used by BaseLayout search bar
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = req.query.q || '';
    let patients;
    
    if (q.length >= 2) {
      patients = await all(
        `SELECT id, name, dob, gender FROM patients WHERE name LIKE ? OR id LIKE ? LIMIT 20`,
        [`%${q}%`, `%${q}%`]
      );
    } else {
      patients = await all(`SELECT id, name, dob, gender FROM patients LIMIT 20`);
    }

    // Map to frontend Patient shape
    const mapped = patients.map(p => ({
      id: p.id,
      name: p.name,
      mrn: p.id,
      age: p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : 0,
      dob: p.dob,
      gender: p.gender || 'Not specified',
      bloodGroup: 'Unknown',
      initials: p.name.split(' ').map(w => w[0]).join(''),
      riskFlags: [],
      allergies: [],
      vitals: { bp: '—', hr: 0, temp: 0, spo2: 0 },
      activeMeds: []
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:patientId — used by PatientDossier, NurseTriage
router.get('/:patientId', requireAuth, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const patient = await get(`SELECT id, name, dob, gender FROM patients WHERE id = ?`, [patientId]);
    
    if (!patient) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Patient not found.' });
    }

    // Map to frontend Patient shape
    res.json({
      id: patient.id,
      name: patient.name,
      mrn: patient.id,
      age: patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / 31557600000) : 0,
      dob: patient.dob,
      gender: patient.gender || 'Not specified',
      bloodGroup: 'Unknown',
      initials: patient.name.split(' ').map(w => w[0]).join(''),
      riskFlags: [],
      allergies: [],
      vitals: { bp: '120/80', hr: 72, temp: 37.0, spo2: 99 },
      activeMeds: []
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/patients/:patientId/timeline — timeline events
router.get('/:patientId/timeline', requireAuth, async (req, res, next) => {
  try {
    const { patientId } = req.params;
    
    // Build timeline from encounters + notes + prescriptions
    const encounters = await all(
      `SELECT e.id, e.phase, e.is_discharged, e.__v
       FROM encounters e WHERE e.patient_id = ?`,
      [patientId]
    );

    const timeline = [];
    for (const enc of encounters) {
      timeline.push({
        id: `tl-enc-${enc.id}`,
        patientId,
        date: new Date().toISOString().split('T')[0],
        type: enc.is_discharged ? 'discharge' : 'encounter',
        title: `Encounter ${enc.id}`,
        description: `Phase: ${enc.phase}`,
        author: 'System'
      });
    }

    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

// POST /api/patients/:patientId/break-glass — Emergency access override
router.post('/:patientId/break-glass', requireAuth, requireRole(['DOCTOR', 'NURSE']), async (req, res, next) => {
  const { patientId } = req.params;
  const { justification } = req.body;

  if (!justification || justification.trim().length < 10) {
    return next({ status: 400, code: 'INSUFFICIENT_JUSTIFICATION', message: 'Break-glass requires a justification of at least 10 characters.' });
  }

  try {
    const patient = await get(`SELECT id FROM patients WHERE id = ?`, [patientId]);
    if (!patient) return next({ status: 404, code: 'NOT_FOUND', message: 'Patient not found' });

    // Write immutable audit event — this cannot be reversed
    // We import writeAuditDirect here since patients.js did not have it
    const { writeAuditDirect } = require('../middleware/audit');
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patientId,
      action: `BREAK_GLASS:patient:${patientId}:reason:${justification.substring(0, 200)}`
    });

    res.json({
      granted: true,
      message: 'Emergency access granted. All actions are being recorded.',
      patientId,
      actor: req.user.id,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
