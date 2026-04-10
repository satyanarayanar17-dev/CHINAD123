const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all, run, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { createRateLimiter } = require('../middleware/rateLimit');
const { assertPatientRecord, loadPatientRecord, resolveSingleActiveEncounter } = require('../lib/careFlow');
const { logEvent } = require('../lib/logger');

const router = express.Router();
const activationOtpDelivery =
  process.env.ACTIVATION_OTP_DELIVERY ||
  (process.env.NODE_ENV === 'production' ? 'console' : 'api_response');

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

const claimRateLimit = createRateLimiter({
  max: 5,
  windowMs: 20 * 60 * 1000,
  keyFn: (req) => req.body?.patient_id || req.ip,
  message: 'Too many activation attempts for this UHID. Please wait 20 minutes before trying again.'
});

/**
 * POST /api/activation/generate
 * Generate a 6-digit OTP for a patient UHID. Requires ADMIN/NURSE/DOCTOR auth.
 * Rate limited to 5 requests per staff user per 10 minutes.
 */
router.post('/generate', requireAuth, requireRole(['ADMIN', 'NURSE', 'DOCTOR']), generateLimiter, async (req, res, next) => {
  const { patient_id } = req.body;
  if (!patient_id) {
    logEvent('warn', 'activation_generate_rejected', {
      correlationId: req.correlationId,
      actorId: req.user.id,
      reason: 'missing_patient_id'
    });
    return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id is required' });
  }

  try {
    const patientRecord = await loadPatientRecord({ get }, patient_id);
    assertPatientRecord(patientRecord);

    await resolveSingleActiveEncounter({ all }, patient_id, {
      missingMessage: 'Patient must have an active encounter before activation can be issued.',
      malformedMessage: 'Patient activation is blocked because the linked encounter is malformed.',
      duplicateMessage: 'Multiple active encounters exist for this patient. Repair the data before issuing activation.'
    });

    // Block if a user account already exists for this patient
    const existingUser = await get(`SELECT id FROM users WHERE patient_id = ?`, [patient_id]);
    if (existingUser) {
      logEvent('warn', 'activation_generate_rejected', {
        correlationId: req.correlationId,
        actorId: req.user.id,
        patientId: patient_id,
        reason: 'account_already_exists'
      });
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
      action: 'PATIENT_ACTIVATION_OTP_GENERATED',
      new_state: JSON.stringify({ expires_at: expiresAt, generated_by_role: req.user.role })
    });

    console.log(`\n---------------------------------------------------------`);
    console.log(`[SYS: MOCK SMS] To: Patient ${patient_id}`);
    console.log(`[SYS: MOCK SMS] Your Chettinad Care activation code is: ${otp}. Valid for 20 mins.`);
    console.log(`---------------------------------------------------------\n`);

    const response = {
      message: 'Activation token generated and delivered.',
      expires_at: expiresAt
    };

    if (activationOtpDelivery === 'api_response') {
      response.activation_code = otp;
      response.delivery_mode = 'api_response';
    } else if (process.env.NODE_ENV !== 'production') {
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
    logEvent('warn', 'activation_claim_rejected', {
      correlationId: req.correlationId,
      patientId: patient_id || null,
      reason: 'missing_fields'
    });
    return res.status(400).json({ error: 'MISSING_DATA', message: 'patient_id, otp, and new_password are required' });
  }

  if (new_password.length < 8) {
    logEvent('warn', 'activation_claim_rejected', {
      correlationId: req.correlationId,
      patientId: patient_id,
      reason: 'weak_password'
    });
    return res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' });
  }

  try {
    const activationResult = await withTransaction(async (tx) => {
      const patientRecord = await loadPatientRecord(tx, patient_id);
      assertPatientRecord(patientRecord);

      await resolveSingleActiveEncounter(tx, patient_id, {
        missingMessage: 'Activation cannot continue until an active encounter exists for this patient.',
        malformedMessage: 'Activation is blocked because the linked encounter is malformed.',
        duplicateMessage: 'Activation is blocked because multiple active encounters exist for this patient.'
      });

      const tokenRecord = await tx.get(
        `SELECT * FROM patient_activation_tokens WHERE patient_id = ? AND otp = ?`,
        [patient_id, otp]
      );

      if (!tokenRecord) {
        throw {
          status: 401,
          code: 'INVALID_TOKEN',
          message: 'Activation code is invalid or does not match this UHID.'
        };
      }

      const now = new Date();
      const expiry = new Date(tokenRecord.expires_at);
      if (now > expiry) {
        await tx.run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);
        throw {
          status: 401,
          code: 'EXPIRED_TOKEN',
          message: 'Activation code has expired. Please request a new one.'
        };
      }

      const existingUser = await tx.get(`SELECT id FROM users WHERE patient_id = ?`, [patient_id]);
      if (existingUser) {
        throw {
          status: 409,
          code: 'ACCOUNT_EXISTS',
          message: 'An account has already been claimed for this UHID.'
        };
      }

      const newUserId = `usr-${patient_id}`;
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(new_password, salt);

      await tx.run(
        `INSERT INTO users (id, role, name, password_hash, is_active, patient_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [newUserId, 'PATIENT', patientRecord.name, hash, 1, patient_id]
      );

      await tx.run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient_id]);

      return { newUserId };
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: activationResult.newUserId,
      patient_id,
      action: 'PATIENT_ACTIVATION_CLAIM_SUCCESS',
      new_state: JSON.stringify({ activated_user_id: activationResult.newUserId })
    });

    res.json({ message: 'Account successfully activated. You may now log in.' });
  } catch (err) {
    if (err?.code) {
      logEvent(err.status >= 500 ? 'error' : 'warn', 'activation_claim_failed', {
        correlationId: req.correlationId,
        patientId: patient_id,
        code: err.code,
        message: err.message
      });
    }
    next(err);
  }
});

module.exports = router;
