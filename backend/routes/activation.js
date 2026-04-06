const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

// Helper: generate 6 digit code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * PATH: /api/activation/generate
 * SCOPE: ADMIN or DOCTOR/NURSE 
 * Generates an OTP for a given patient_id.
 */
router.post('/generate', requireAuth, requireRole(['ADMIN', 'NURSE', 'DOCTOR']), async (req, res, next) => {
  const { patient_id } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id is required' });

  try {
    const patientExists = await get(`SELECT id FROM patients WHERE id = ?`, [patient_id]);
    if (!patientExists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Patient demographic record not found.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 20 * 60000); // 20 mins from now

    // Upsert equivalent
    await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);
    
    // SQLite vs PG datetime differences handled broadly by storing standard ISO.
    // For universal simplicity we use ISO strings.
    const expiresString = expiresAt.toISOString();

    await run(`INSERT INTO patient_activation_tokens (patient_id, otp, expires_at) VALUES (?, ?, ?)`, [patient_id, otp, expiresString]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patient_id,
      action: 'PATIENT_ACTIVATION_OTP_GENERATED'
    });

    // Simulated SMS delivery mechanism
    console.log(`\n\n---------------------------------------------------------`);
    console.log(`[SYS: MOCK SMS PROVIDER] To: Patient ${patient_id}`);
    console.log(`[SYS: MOCK SMS PROVIDER] Body: Your Chettinad Care activation code is: ${otp}. Valid for 20 mins.`);
    console.log(`---------------------------------------------------------\n\n`);

    res.json({ message: 'Activation token generated and delivered.', _meta: { debug_otp: otp } });

  } catch (err) {
    next(err);
  }
});

/**
 * PATH: /api/activation/claim
 * SCOPE: PUBLIC
 * Claims a patient identity using OTP + UHID
 */
router.post('/claim', async (req, res, next) => {
  const { patient_id, otp, new_password } = req.body;
  if (!patient_id || !otp || !new_password) {
    return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id, otp, and new_password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' });
  }

  try {
    // Verify OTP
    const tokenRecord = await get(`SELECT * FROM patient_activation_tokens WHERE patient_id = ? AND otp = ?`, [patient_id, otp]);
    if (!tokenRecord) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Activation code is invalid or does not match this UHID.' });
    }

    const now = new Date();
    const expiry = new Date(tokenRecord.expires_at);

    if (now > expiry) {
      await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);
      return res.status(401).json({ error: 'EXPIRED_TOKEN', message: 'Activation code has expired. Please request a new one.' });
    }

    // Verify patient hasn't already claimed their account
    const existingUser = await get(`SELECT id FROM users WHERE patient_id = ?`, [patient_id]);
    if (existingUser) {
       return res.status(409).json({ error: 'ACCOUNT_EXISTS', message: 'An account has already been claimed for this UHID.' });
    }

    // Hash password & Create user. 
    // We use the patient_id as the user 'id' for simplicity, or generate a random one.
    // Given 'id' in users is just an opaque primary key, making it 'usr-pat-UHID' avoids collisions.
    const newUserId = `usr-${patient_id}`;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);

    const patientDemographic = await get(`SELECT name FROM patients WHERE id = ?`, [patient_id]);

    await run(`INSERT INTO users (id, role, name, password_hash, is_active, patient_id) VALUES (?, ?, ?, ?, ?, ?)`, 
      [newUserId, 'PATIENT', patientDemographic.name, hash, 1, patient_id]
    );

    // Burn token
    await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: newUserId,
      patient_id: patient_id,
      action: 'PATIENT_ACTIVATION_CLAIM_SUCCESS'
    });

    res.json({ message: 'Account successfully activated. You may now log in.' });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
