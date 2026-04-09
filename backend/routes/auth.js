const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const REFRESH_TOKEN_TTL_DAYS = 30;
const ACCESS_TOKEN_TTL = '15m';
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

function refreshTokenExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d.toISOString();
}

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  const isPilotMode = process.env.PILOT_AUTH_BYPASS === 'true';

  if (process.env.NODE_ENV === 'production' && isPilotMode) {
    return next({ status: 500, code: 'AUTH_ENVELOPE_BREACH', message: 'Deployment environment is misconfigured. Access halted.' });
  }

  try {
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [username]);

    if (!userRow) {
      await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_DENIAL:UNKNOWN_USER' });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    // Account disabled
    if (userRow.is_active === 0) {
      await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_FAILED:INACTIVE' });
      return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
    }

    // Account lockout check
    if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(userRow.locked_until) - new Date()) / 1000);
      await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_FAILED:LOCKED' });
      return res.status(429).json({
        error: 'ACCOUNT_LOCKED',
        message: `Account temporarily locked. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        retry_after_seconds: retryAfter
      });
    }

    let isValidPassword = false;

    if (isPilotMode && process.env.NODE_ENV !== 'production' && !userRow.password_hash) {
      isValidPassword = true;
    } else if (userRow.password_hash && password) {
      isValidPassword = await bcrypt.compare(password, userRow.password_hash);
    }

    if (!isValidPassword) {
      // Increment failure count; lock if threshold reached
      const newAttempts = (userRow.failed_attempts || 0) + 1;
      const lockedUntil = newAttempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : userRow.locked_until || null;

      await run(
        `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        [newAttempts, lockedUntil, username]
      );

      await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_DENIAL' });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    // Success — reset lockout state
    await run(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [username]);

    const { id: actorId, role, name } = userRow;

    const accessToken = jwt.sign({ id: actorId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    // Issue refresh token
    const refreshToken = crypto.randomUUID();
    await run(
      `INSERT INTO refresh_tokens (id, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)`,
      [refreshToken, actorId, refreshTokenExpiresAt()]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: actorId,
      action: `SYS_AUTH_LOGIN:${role}`
    });

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      userId: actorId,
      name,
      role: role.toLowerCase(),
      _meta: { mode: isPilotMode ? 'PILOT_CONTROLLED' : 'RESTRICTED_DEPLOYMENT', safety: isPilotMode ? 'non-production' : 'hardened' }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(401).json({ error: 'REFRESH_REQUIRED', message: 'refresh_token is required.' });
  }

  try {
    const tokenRow = await get(
      `SELECT rt.*, u.role, u.is_active FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.id = ?`,
      [refresh_token]
    );

    if (!tokenRow) {
      return res.status(401).json({ error: 'REFRESH_INVALID', message: 'Invalid refresh token.' });
    }

    if (tokenRow.revoked === 1) {
      await writeAuditDirect({ correlation_id: req.correlationId, actor_id: tokenRow.user_id, action: 'SYS_AUTH_REFRESH:REVOKED_TOKEN_REUSE' });
      return res.status(401).json({ error: 'REFRESH_REVOKED', message: 'Refresh token has been revoked.' });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return res.status(401).json({ error: 'REFRESH_EXPIRED', message: 'Refresh token has expired. Please log in again.' });
    }

    if (tokenRow.is_active === 0) {
      return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
    }

    const newAccessToken = jwt.sign({ id: tokenRow.user_id, role: tokenRow.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

    res.json({ access_token: newAccessToken, token_type: 'bearer' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    try {
      await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refresh_token]);
    } catch (err) {
      // Non-fatal — client-side token clear still proceeds
      console.error('[AUTH] Failed to revoke refresh token:', err.message);
    }
  }
  res.json({ message: 'Logged out.' });
});

router.get('/me', require('../middleware/auth').requireAuth, async (req, res, next) => {
  try {
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!userRow || userRow.is_active === 0) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Identity not found or inactive.' });
    }
    return res.json({ id: userRow.id, role: userRow.role.toLowerCase(), name: userRow.name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
