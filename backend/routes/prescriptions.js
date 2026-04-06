const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

// GET PRESCRIPTION BY ID
router.get('/:rxId', requireAuth, async (req, res, next) => {
  try {
    const rx = await get(`SELECT p.*, e.patient_id FROM prescriptions p JOIN encounters e ON p.encounter_id = e.id WHERE p.id = ?`, [req.params.rxId]);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND', message: 'Prescription not found.' });
    res.json(rx);
  } catch (err) {
    next(err);
  }
});

// CREATE NEW PRESCRIPTION (Finds active encounter for patient)
router.post('/', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId, rx_content } = req.body;
  if (!patientId) return next({ status: 400, code: 'MISSING_PATIENT_ID' });

  try {
    const encounter = await get(`SELECT id FROM encounters WHERE patient_id = ? AND is_discharged = 0 ORDER BY id DESC LIMIT 1`, [patientId]);
    if (!encounter) return next({ status: 422, code: 'NO_ACTIVE_ENCOUNTER', message: 'Patient lacks an active encounter for prescription.' });

    const rxId = `rx-${Date.now()}`;
    await run(`INSERT INTO prescriptions (id, encounter_id, rx_content, status, __v) VALUES (?, ?, ?, 'DRAFT', 1)`, [rxId, encounter.id, rx_content || '']);
    
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `RX_CREATE:${rxId}`
    });

    res.json({ rxId, newVersion: 1 });
  } catch (err) {
    next(err);
  }
});

// UPDATE DRAFT PRESCRIPTION
router.put('/:rxId', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { rxId } = req.params;
  const { rx_content, version } = req.body;

  if (version === undefined) return next({ status: 400, code: 'MISSING_VERSION' });

  try {
    const rx = await get(`SELECT * FROM prescriptions WHERE id = ?`, [rxId]);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND' });

    if (rx.status === 'AUTHORIZED') {
      return next({ status: 422, code: 'INVALID_STATE', message: 'Cannot edit an authorized prescription.' });
    }

    if (rx.__v !== version) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Prescription conflict detected.' });
    }

    await run(`
      UPDATE prescriptions 
      SET rx_content = ?, __v = __v + 1 
      WHERE id = ? AND __v = ?
    `, [rx_content, rxId, version]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `RX_SAVE:${rxId}`
    });

    res.json({ message: 'Prescription saved', newVersion: version + 1 });
  } catch (err) {
    next(err);
  }
});

// AUTHORIZE PRESCRIPTION
router.post('/:rxId/authorize', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { rxId } = req.params;
  const { version } = req.body;
  const doctorId = req.user.id;

  if (version === undefined) return next({ status: 400, code: 'MISSING_VERSION' });

  try {
    const rx = await get(`SELECT * FROM prescriptions WHERE id = ?`, [rxId]);
    if (!rx) return next({ status: 404, code: 'NOT_FOUND' });

    if (rx.status === 'AUTHORIZED') {
      return next({ status: 422, code: 'INVALID_STATE', message: 'Prescription already authorized.' });
    }

    if (rx.__v !== version) {
      return next({ status: 409, code: 'STALE_STATE' });
    }

    // Explicitly bind the authorizing doctor to the immutable record
    await run(`
      UPDATE prescriptions 
      SET status = 'AUTHORIZED', authorizing_user_id = ?, __v = __v + 1 
      WHERE id = ? AND __v = ?
    `, [doctorId, rxId, version]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `RX_AUTHORIZE:${rxId}:by:${doctorId}`
    });

    res.json({ message: 'Prescription officially authorized' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
