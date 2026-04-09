const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { get } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter — no extra dependency required.
// Tracks failed login attempts per IP. Resets after window expires.
// ---------------------------------------------------------------------------
const loginAttempts = new Map(); // key: ip -> { count, resetAt }

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function loginRateLimit(req, res, next) {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record && now < record.resetAt) {
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      console.warn(`[RATE_LIMIT] Login blocked for ${key} — ${record.count} attempts in window`);
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many login attempts. Try again in ${Math.ceil((record.resetAt - now) / 60000)} minutes.`
        }
      });
    }
    record.count++;
  } else {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  }

  next();
}

function clearRateLimit(key) {
  loginAttempts.delete(key || 'unknown');
}

// ---------------------------------------------------------------------------

router.post('/login', loginRateLimit, async (req, res, next) => {
  const { username, password } = req.body;
  const isPilotMode = process.env.PILOT_AUTH_BYPASS === 'true';
  const ipKey = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (process.env.NODE_ENV === 'production' && isPilotMode) {
    return next({ status: 500, code: 'AUTH_ENVELOPE_BREACH', message: 'Deployment environment is misconfigured. Access halted.' });
  }

  try {
    let role = null;
    let actorId = null;
    let name = null;
    let isValidPassword = false;

    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [username]);
    if (userRow) {
      if (userRow.is_active === 0) {
        await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_FAILED:INACTIVE' });
        return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
      }

      if (isPilotMode && process.env.NODE_ENV !== 'production' && !userRow.password_hash) {
        isValidPassword = true;
      } else if (userRow.password_hash && password) {
        isValidPassword = await bcrypt.compare(password, userRow.password_hash);
      }

      if (isValidPassword) {
        role = userRow.role;
        actorId = userRow.id;
        name = userRow.name;
      }
    }

    if (!isValidPassword) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: username,
        action: 'SYS_AUTH_DENIAL'
      });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' });
    }

    // Successful login — clear rate limit record for this IP
    clearRateLimit(ipKey);

    const token = jwt.sign({ id: actorId, role }, JWT_SECRET, { expiresIn: '12h' });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: actorId,
      action: `SYS_AUTH_LOGIN:${role}`
    });

    res.json({
      access_token: token,
      token_type: 'bearer',
      userId: actorId,
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

router.post('/refresh', (req, res, next) => {
  return next({ status: 401, code: 'REFRESH_FAILED' });
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
