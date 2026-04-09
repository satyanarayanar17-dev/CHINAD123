const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createRateLimiter } = require('../middleware/rateLimit');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { JWT_SECRET, requireAuth, requireRole } = require('../middleware/auth');
const { REFRESH_COOKIE_NAME, getRefreshCookieOptions } = require('../cookies');

const router = express.Router();

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;
const ACCESS_TOKEN_TTL = '15m';
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const SSE_TOKEN_TTL = '60s';

const loginRateLimit = createRateLimiter({
  max: LOGIN_MAX_ATTEMPTS,
  windowMs: LOGIN_WINDOW_MS,
  keyFn: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
  message: 'Too many login attempts. Please wait 15 minutes before trying again.'
});

function refreshTokenExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d.toISOString();
}

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, getRefreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
}

router.post('/login', loginRateLimit, async (req, res, next) => {
  const { username, password } = req.body;
  const isPilotMode = process.env.PILOT_AUTH_BYPASS === 'true';
  const ipKey = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (process.env.NODE_ENV === 'production' && isPilotMode) {
    return next({ status: 500, code: 'AUTH_ENVELOPE_BREACH', message: 'Deployment environment is misconfigured. Access halted.' });
  }

  try {
    const userRow = await get(
      `SELECT * FROM users
       WHERE id = ? OR (role = 'PATIENT' AND patient_id = ?)
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [username, username, username]
    );

    if (!userRow) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: username,
        action: 'SYS_AUTH_DENIAL:UNKNOWN_USER',
        new_state: JSON.stringify({ username, ip: ipKey, outcome: 'failure' })
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    // Account disabled
    if (userRow.is_active === 0) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: username,
        action: 'SYS_AUTH_FAILED:INACTIVE',
        new_state: JSON.stringify({ username, ip: ipKey, outcome: 'inactive' })
      });
      return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
    }

    // Per-user DB lockout check
    if (userRow.locked_until && new Date(userRow.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(userRow.locked_until) - new Date()) / 1000);
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: username,
        action: 'SYS_AUTH_FAILED:LOCKED',
        new_state: JSON.stringify({ username, ip: ipKey, outcome: 'locked', retry_after_seconds: retryAfter })
      });
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
      // Increment failure count; lock account if threshold reached
      const newAttempts = (userRow.failed_attempts || 0) + 1;
      const lockedUntil = newAttempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : userRow.locked_until || null;

      await run(
        `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        [newAttempts, lockedUntil, userRow.id]
      );

      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: userRow.id,
        patient_id: userRow.patient_id || null,
        action: 'SYS_AUTH_DENIAL',
        new_state: JSON.stringify({
          username,
          ip: ipKey,
          failed_attempts: newAttempts,
          locked_until: lockedUntil,
          outcome: 'failure'
        })
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    // Success — clear DB lockout state
    await run(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [userRow.id]);

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
      patient_id: userRow.patient_id || null,
      action: `SYS_AUTH_LOGIN:${role}`,
      new_state: JSON.stringify({ role, ip: ipKey, outcome: 'success' })
    });

    setRefreshCookie(res, refreshToken);
    setNoStore(res);

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      userId: actorId,
      name,
      role: role.toLowerCase(),
      _meta: {
        mode: isPilotMode ? 'PILOT_CONTROLLED' : 'RESTRICTED_DEPLOYMENT',
        safety: isPilotMode ? 'non-production' : 'hardened'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'REFRESH_REQUIRED', message: 'refresh_token is required.' });
  }

  try {
    const tokenRow = await get(
      `SELECT rt.*, u.role, u.is_active FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.id = ?`,
      [refreshToken]
    );

    if (!tokenRow) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'REFRESH_INVALID', message: 'Invalid refresh token.' });
    }

    if (tokenRow.revoked === 1) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: tokenRow.user_id,
        action: 'SYS_AUTH_REFRESH:REVOKED_TOKEN_REUSE',
        new_state: JSON.stringify({ refresh_token_id: refreshToken })
      });
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'REFRESH_REVOKED', message: 'Refresh token has been revoked.' });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refreshToken]);
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'REFRESH_EXPIRED', message: 'Refresh token has expired. Please log in again.' });
    }

    if (tokenRow.is_active === 0) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
    }

    await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refreshToken]);
    const replacementRefreshToken = crypto.randomUUID();
    await run(
      `INSERT INTO refresh_tokens (id, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)`,
      [replacementRefreshToken, tokenRow.user_id, refreshTokenExpiresAt()]
    );

    const newAccessToken = jwt.sign({ id: tokenRow.user_id, role: tokenRow.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
    setRefreshCookie(res, replacementRefreshToken);
    setNoStore(res);

    res.json({ access_token: newAccessToken, token_type: 'bearer' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refresh_token;
  if (refreshToken) {
    try {
      await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refreshToken]);
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: 'UNKNOWN',
        action: 'SYS_AUTH_LOGOUT',
        new_state: JSON.stringify({ refresh_token_id: refreshToken })
      });
    } catch (err) {
      console.error('[AUTH] Failed to revoke refresh token:', err.message);
    }
  }
  clearRefreshCookie(res);
  setNoStore(res);
  res.json({ message: 'Logged out.' });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!userRow || userRow.is_active === 0) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Identity not found or inactive.' });
    }
    setNoStore(res);
    return res.json({ id: userRow.id, role: userRow.role.toLowerCase(), name: userRow.name });
  } catch (err) {
    next(err);
  }
});

router.get('/sse-token', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role, purpose: 'sse' },
      JWT_SECRET,
      { expiresIn: SSE_TOKEN_TTL }
    );
    setNoStore(res);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
