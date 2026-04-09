const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ---------------------------------------------------------------------------
// Rate limiting — P2: inline claim limiter (tracks failed attempts per UHID)
// P3 addition: generate limiter via shared factory (5 per 10 min per staff user)
// ---------------------------------------------------------------------------

// P3: Shared factory for OTP generation — prevents staff from spamming OTPs
const generateLimiter = createRateLimiter({
  max: 5,
  windowMs: 10 * 60 * 1000,
  keyFn: (req) => req.user?.id || req.ip,
  message: 'Too many OTP generation requests. Please wait 10 minutes before trying again.'
});

// P2: Inline claim rate limiter — tracks failed attempts per patient UHID
// Matches the 20-minute OTP window. Clears on success.
const claimAttempts = new Map(); // patient_id -> { count, resetAt }
const CLAIM_MAX_ATTEMPTS = 5;
const CLAIM_WINDOW_MS = 20 * 60 * 1000;

function claimRateLimit(req, res, next) {
  const { patient_id } = req.body;
  if (!patient_id) return next();

  const now = Date.now();
  const record = claimAttempts.get(patient_id);

  if (record && now < record.resetAt) {
    if (record.count >= CLAIM_MAX_ATTEMPTS) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many activation attempts for this UHID. Try again in ${Math.ceil((record.resetAt - now) / 60000)} minutes.`
        }
      });
    }
    record.count++;
  } else {
    claimAttempts.set(patient_id, { count: 1, resetAt: now + CLAIM_WINDOW_MS });
  }
  next();
}

/**
 * POST /api/activation/generate
 * Generate a 6-digit OTP for a patient UHID. Requires ADMIN/NURSE/DOCTOR auth.
 * Rate limited to 5 requests per staff user per 10 minutes.
 */
router.post('/generate', requireAuth, requireRole(['ADMIN', 'NURSE', 'DOCTOR']), generateLimiter, async (req, res, next) => {
  const { patient_id } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id is required' });

  try {
    const patientExists = await get(`SELECT id FROM patients WHERE id = ?`, [patient_id]);
    if (!patientExists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Patient demographic record not found.' });
    }

    // Block if a user account already exists for this patient
    const existingUser = await get(`SELECT id FROM users WHERE patient_id = ?`, [patient_id]);
    if (existingUser) {
      return res.status(409).json({ error: 'ACCOUNT_EXISTS', message: 'A portal account already exists for this patient.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 20 * 60000).toISOString();

    await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);
    await run(
      `INSERT INTO patient_activation_tokens (patient_id, otp, expires_at) VALUES (?, ?, ?)`,
      [patient_id, otp, expiresAt]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id,
      action: 'PATIENT_ACTIVATION_OTP_GENERATED'
    });

    console.log(`\n---------------------------------------------------------`);
    console.log(`[SYS: MOCK SMS] To: Patient ${patient_id}`);
    console.log(`[SYS: MOCK SMS] Your Chettinad Care activation code is: ${otp}. Valid for 20 mins.`);
    console.log(`---------------------------------------------------------\n`);

    const response = { message: 'Activation token generated and delivered.' };
    if (process.env.NODE_ENV !== 'production') {
      response._meta = { debug_otp: otp };
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/activation/claim
 * Public route — patient claims their account using UHID + OTP.
 * Rate limited to 5 attempts per UHID within the OTP window.
 */
router.post('/claim', claimRateLimit, async (req, res, next) => {
  const { patient_id, otp, new_password } = req.body;
  if (!patient_id || !otp || !new_password) {
    return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id, otp, and new_password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' });
  }

  try {
    const tokenRecord = await get(
      `SELECT * FROM patient_activation_tokens WHERE patient_id = ? AND otp = ?`,
      [patient_id, otp]
    );

    if (!tokenRecord) {
      // Increment attempt counter on failure
      const record = claimAttempts.get(patient_id);
      if (record) record.count++;
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Activation code is invalid or does not match this UHID.' });
    }

    const now = new Date();
    const expiry = new Date(tokenRecord.expires_at);
    if (now > expiry) {
      await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);
      return res.status(401).json({ error: 'EXPIRED_TOKEN', message: 'Activation code has expired. Please request a new one.' });
    }

    const existingUser = await get(`SELECT id FROM users WHERE patient_id = ?`, [patient_id]);
    if (existingUser) {
      return res.status(409).json({ error: 'ACCOUNT_EXISTS', message: 'An account has already been claimed for this UHID.' });
    }

    const newUserId = `usr-${patient_id}`;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);

    const patientDemographic = await get(`SELECT name FROM patients WHERE id = ?`, [patient_id]);

    await run(
      `INSERT INTO users (id, role, name, password_hash, is_active, patient_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [newUserId, 'PATIENT', patientDemographic.name, hash, 1, patient_id]
    );

    await run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);

    // Clear rate limit on success
    claimAttempts.delete(patient_id);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: newUserId,
      patient_id,
      action: 'PATIENT_ACTIVATION_CLAIM_SUCCESS'
    });

    res.json({ message: 'Account successfully activated. You may now log in.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
