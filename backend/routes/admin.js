const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { requireAuth, requireRole, clearRevocationCache } = require('../middleware/auth');
const { get, all, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;
const TEMP_PASSWORD_LENGTH = 18;

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-_=';
  const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

/**
 * GET /api/admin/users
 * List all staff accounts (id, role, name, is_active — NO password hashes)
 */
router.get('/users', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const users = await all(
      `SELECT id, role, name, is_active
       FROM users
       WHERE role IN ('ADMIN', 'DOCTOR', 'NURSE')
       ORDER BY role, name`
    );
    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Create a new staff account with hashed password.
 * Body: { id, role, name, password }
 */
router.post('/users', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { id, role, name, password } = req.body;

  // Input validation
  if (!id || !role || !name || !password) {
    return next({ status: 400, code: 'MISSING_FIELDS', message: 'id, role, name, and password are all required.' });
  }

  const allowedRoles = ['NURSE', 'DOCTOR', 'ADMIN'];
  if (!allowedRoles.includes(role)) {
    return next({ status: 400, code: 'INVALID_ROLE', message: `Role must be one of: ${allowedRoles.join(', ')}` });
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return next({ status: 400, code: 'WEAK_PASSWORD', message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  }

  try {
    // Check for existing user
    const existing = await get(`SELECT id FROM users WHERE id = ?`, [id]);
    if (existing) {
      return next({ status: 409, code: 'USER_EXISTS', message: 'A user with this ID already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await run(
      `INSERT INTO users (id, role, name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)`,
      [id, role, name, passwordHash]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_CREATE:${id}:role:${role}:by:${req.user.id}`,
      new_state: JSON.stringify({ user_id: id, role, name })
    });

    res.status(201).json({ userId: id, role, name, created: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:userId/disable
 * Deactivate a staff account. Does not delete the record.
 */
router.patch('/users/:userId/disable', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  // Prevent self-disable
  if (userId === req.user.id) {
    return next({ status: 400, code: 'SELF_DISABLE', message: 'Administrators cannot disable their own account.' });
  }

  try {
    const user = await get(`SELECT id, is_active FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    if (user.is_active === 0) {
      return next({ status: 422, code: 'ALREADY_DISABLED', message: 'Account is already disabled.' });
    }

    await run(`UPDATE users SET is_active = 0 WHERE id = ?`, [userId]);

    // Insert / overwrite a revocation record so any live JWTs for this user
    // are rejected by requireAuth within the 60-second cache TTL window.
    await run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
    await run(`INSERT INTO revoked_tokens (user_id, revoked_at) VALUES (?, CURRENT_TIMESTAMP)`, [userId]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_DISABLE:${userId}:by:${req.user.id}`
    });

    res.json({ userId, disabled: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:userId/enable
 * Re-activate a disabled staff account.
 */
router.patch('/users/:userId/enable', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await get(`SELECT id, is_active FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    if (user.is_active === 1) {
      return next({ status: 422, code: 'ALREADY_ACTIVE', message: 'Account is already active.' });
    }

    await run(`UPDATE users SET is_active = 1 WHERE id = ?`, [userId]);

    // Remove the revocation record and clear the in-process cache so that
    // freshly-issued tokens for this user are accepted immediately.
    await run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
    clearRevocationCache(userId);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_ENABLE:${userId}:by:${req.user.id}`
    });

    res.json({ userId, enabled: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin-driven password reset. Replaces password hash immediately.
 */
router.post('/users/:userId/reset-password', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await get(`SELECT id FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const newHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
    await run(
      `UPDATE users
       SET password_hash = ?, must_change_password = 1
       WHERE id = ?`,
      [newHash, userId]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_PASS_RESET:${userId}:by:${req.user.id}`
    });

    res.json({
      userId,
      reset: true,
      temporaryPassword,
      must_change_password: true,
      message: 'Temporary password generated. Share it securely with the staff member.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/encounters/:encounterId/reassign
 *
 * Admin-only emergency encounter reassignment. Transfers ownership of any
 * active encounter to a different doctor regardless of lifecycle phase.
 * This is the legitimate escape valve for cases where a patient is
 * IN_CONSULTATION and the assigned doctor becomes unavailable — the normal
 * nurse triage handoff path blocks reassignment in that phase.
 *
 * Full audit trail: prior and new assigned_doctor_id are both recorded.
 * OCC: uses __v to detect concurrent modifications.
 */
router.post('/encounters/:encounterId/reassign', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { doctorId } = req.body;

  if (!doctorId || typeof doctorId !== 'string' || !doctorId.trim()) {
    return next({ status: 400, code: 'DOCTOR_ID_REQUIRED', message: 'doctorId is required.' });
  }

  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Encounter not found.' });
    }

    if (encounter.is_discharged) {
      return next({ status: 422, code: 'ENCOUNTER_CLOSED', message: 'Cannot reassign a discharged encounter.' });
    }

    const doctor = await get(
      `SELECT id, name, role, is_active FROM users WHERE id = ?`,
      [doctorId.trim()]
    );

    if (!doctor || doctor.role !== 'DOCTOR') {
      return next({ status: 404, code: 'DOCTOR_NOT_FOUND', message: 'Target doctor not found.' });
    }

    if (doctor.is_active !== 1) {
      return next({ status: 422, code: 'DOCTOR_UNAVAILABLE', message: 'Target doctor account is inactive.' });
    }

    const previousDoctorId = encounter.assigned_doctor_id || null;

    const result = await run(
      `UPDATE encounters SET assigned_doctor_id = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [doctor.id, encounterId, encounter.__v]
    );

    if (result.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Encounter was modified concurrently. Please retry.' });
    }

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `ADMIN_ENCOUNTER_REASSIGN:${encounterId}:from:${previousDoctorId || 'UNASSIGNED'}:to:${doctor.id}:by:${req.user.id}`,
      prior_state: JSON.stringify({ assigned_doctor_id: previousDoctorId, __v: encounter.__v }),
      new_state: JSON.stringify({ assigned_doctor_id: doctor.id, __v: encounter.__v + 1 })
    });

    res.json({
      encounterId,
      previousDoctorId,
      newDoctorId: doctor.id,
      newDoctorName: doctor.name,
      reassigned: true
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
