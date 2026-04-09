const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole, clearRevocationCache } = require('../middleware/auth');
const { get, all, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;

/**
 * GET /api/admin/users
 * List all staff accounts (id, role, name, is_active — NO password hashes)
 */
router.get('/users', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const users = await all(`SELECT id, role, name, is_active FROM users ORDER BY role, name`);
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
      action: `ADMIN_USER_CREATE:${id}:role:${role}:by:${req.user.id}`
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
 * Body: { newPassword }
 */
router.post('/users/:userId/reset-password', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
    return next({ status: 400, code: 'WEAK_PASSWORD', message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  }

  try {
    const user = await get(`SELECT id FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, userId]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_PASS_RESET:${userId}:by:${req.user.id}`
    });

    res.json({ userId, reset: true, message: 'Password has been reset. User must be notified out-of-band.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
