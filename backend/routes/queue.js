const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

// GET QUEUE
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rawQueue = await require('../database').all(`
      SELECT e.id as encounter_id, e.patient_id, e.phase, e.__v,
             p.name, p.dob
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      WHERE e.is_discharged = 0
    `);

    // Map to frontend AppointmentSlot shape exactly
    const slots = rawQueue.map(q => ({
      id: q.encounter_id,
      time: '09:00',
      status: 'ON_TIME',
      patient: {
        id: q.patient_id,
        name: q.name,
        dob: q.dob,
        gender: 'Not specified',
        // Minimal Patient fields to prevent frontend crashes
        mrn: q.patient_id,
        initials: q.name.split(' ').map(w => w[0]).join(''),
        age: 0,
        bloodGroup: 'Unknown',
        riskFlags: [],
        allergies: [],
        vitals: { bp: '—', hr: 0, temp: 0, spo2: 0 },
        activeMeds: []
      },
      type: 'General Review',
      specialty: 'General Medicine',
      lifecycleStatus: q.phase,
      __v: q.__v
    }));

    res.json(slots);
  } catch (err) {
    next(err);
  }
});

router.patch('/:encounterId', requireAuth, requireRole(['NURSE', 'DOCTOR']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { phase, version } = req.body; // Client must provide the expected DB version

  if (version === undefined) {
    return next({ status: 400, code: 'MISSING_VERSION', message: 'Optimistic Concurrency Control requires version integer payload.' });
  }

  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Encounter missing.' });
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
    await run(`
      UPDATE encounters 
      SET phase = ?, __v = __v + 1 
      WHERE id = ? AND __v = ?
    `, [phase, encounterId, version]);

    // Deterministic audit log — written before response
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `QUEUE_TRANSITION:${encounter.phase}->${phase}`
    });

    res.json({ message: 'Queue updated successfully', newVersion: version + 1 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
