const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createRateLimiter } = require('../middleware/rateLimit');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { JWT_SECRET, requireAuth, requireRole } = require('../middleware/auth');
const { REFRESH_COOKIE_NAME, getRefreshCookieOptions } = require('../cookies');
const {
  ACCOUNT_TYPES,
  accountTypeForRole,
  normalizeAccountType,
  roleAllowedForAccountType
} = require('../lib/authBoundary');
const { normalizePatientPhone } = require('../lib/clinicalIntegrity');
const { logEvent } = require('../lib/logger');

const router = express.Router();

/**
 * Builds a standard error envelope consistent with the global error handler shape.
 * Includes correlation_id so every auth rejection is traceable in logs.
 */
function authErr(req, res, status, code, message, extra = {}) {
  return res.status(status).json({
    error: { code, message, ...extra },
    meta: { correlation_id: req.correlationId || null }
  });
}

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;
const ACCESS_TOKEN_TTL = '15m';
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const SSE_TOKEN_TTL = '60s';
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;

function requestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || 'unknown';
}

function normalizeLoginIdentity(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function staffLoginRateLimitKeys(req) {
  const username = normalizeLoginIdentity(req.body?.username) || 'unknown-user';
  const ip = requestIp(req);
  return [
    `auth:staff-login:ip:${ip}`,
    `auth:staff-login:user:${username}`
  ];
}

function patientLoginRateLimitKeys(req) {
  const rawUsername = normalizeLoginIdentity(req.body?.username);
  const normalizedPhone = normalizePatientPhone(rawUsername);
  const patientIdentity = normalizedPhone || rawUsername || 'unknown-patient';
  const ip = requestIp(req);
  return [
    `auth:patient-login:ip:${ip}`,
    `auth:patient-login:patient:${patientIdentity}`
  ];
}

const staffLoginRateLimit = createRateLimiter({
  max: LOGIN_MAX_ATTEMPTS,
  windowMs: LOGIN_WINDOW_MS,
  keyFn: staffLoginRateLimitKeys,
  message: 'Too many staff login attempts. Please wait 15 minutes before trying again.'
});

const patientLoginRateLimit = createRateLimiter({
  max: LOGIN_MAX_ATTEMPTS,
  windowMs: LOGIN_WINDOW_MS,
  keyFn: patientLoginRateLimitKeys,
  message: 'Too many patient login attempts. Please wait 15 minutes before trying again.'
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

function signAccessToken({ actorId, role, accountType }) {
  return jwt.sign(
    { id: actorId, role, account_type: accountType, session_iat_ms: Date.now() },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function serializeMustChangePassword(value) {
  return value === 1 || value === true;
}

async function writeBoundaryMismatchAudit({ req, userRow, username, attemptedAccountType, endpoint }) {
  await writeAuditDirect({
    correlation_id: req.correlationId,
    actor_id: userRow.id,
    patient_id: userRow.patient_id || null,
    action: 'SYS_AUTH_BOUNDARY_DENIAL:ACCOUNT_TYPE_MISMATCH',
    new_state: JSON.stringify({
      username,
      endpoint,
      attempted_account_type: attemptedAccountType,
      actual_role: userRow.role,
      ip: requestIp(req)
    })
  });

  logEvent('warn', 'auth_boundary_violation', {
    correlationId: req.correlationId,
    endpoint,
    username,
    attemptedAccountType,
    actualRole: userRow.role
  });
}

async function recordUnknownLogin({ req, username }) {
  logEvent('warn', 'auth_unknown_user', {
    correlationId: req.correlationId,
    username,
    ip: requestIp(req)
  });

  await writeAuditDirect({
    correlation_id: req.correlationId,
    actor_id: username,
    action: 'SYS_AUTH_DENIAL:UNKNOWN_USER',
    new_state: JSON.stringify({
      username,
      ip: requestIp(req),
      outcome: 'failure'
    })
  });
}

async function recordFailedPassword({ req, userRow, username, ipKey }) {
  const newAttempts = (userRow.failed_attempts || 0) + 1;
  const lockedUntil = newAttempts >= LOCKOUT_THRESHOLD
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    : userRow.locked_until || null;

  await run(
    `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
    [newAttempts, lockedUntil, userRow.id]
  );

  logEvent('warn', 'auth_failed_password', {
    correlationId: req.correlationId,
    userId: userRow.id,
    username,
    failedAttempts: newAttempts,
    lockedUntil
  });

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
}

async function resolveLoginCandidate(username, accountType) {
  if (accountType === ACCOUNT_TYPES.PATIENT) {
    const normalizedPhone = normalizePatientPhone(username);
    return get(
      `SELECT u.*, p.phone AS patient_phone
       FROM users u
       LEFT JOIN patients p ON p.id = u.patient_id
       WHERE u.role = 'PATIENT' AND (u.id = ? OR u.patient_id = ? OR p.phone = ?)
       ORDER BY CASE
         WHEN p.phone = ? THEN 0
         WHEN u.id = ? THEN 1
         WHEN u.patient_id = ? THEN 2
         ELSE 3
       END
       LIMIT 1`,
      [username, username, normalizedPhone, normalizedPhone, username, username]
    );
  }

  if (accountType === ACCOUNT_TYPES.STAFF) {
    return get(
      `SELECT * FROM users
       WHERE role IN ('DOCTOR', 'NURSE', 'ADMIN') AND id = ?
       LIMIT 1`,
      [username]
    );
  }

  return null;
}

async function resolveAnyLoginCandidate(username) {
  const normalizedPhone = normalizePatientPhone(username);
  return get(
    `SELECT u.*, p.phone AS patient_phone
     FROM users u
     LEFT JOIN patients p ON p.id = u.patient_id
     WHERE u.id = ? OR (u.role = 'PATIENT' AND (u.patient_id = ? OR p.phone = ?))
     ORDER BY CASE
       WHEN p.phone = ? THEN 0
       WHEN u.id = ? THEN 1
       WHEN u.patient_id = ? THEN 2
       ELSE 3
     END
     LIMIT 1`,
    [username, username, normalizedPhone, normalizedPhone, username, username]
  );
}

async function verifyPasswordForUser(userRow, password, isPilotMode) {
  if (!userRow) {
    return false;
  }

  if (isPilotMode && process.env.NODE_ENV !== 'production' && !userRow.password_hash) {
    return true;
  }

  if (userRow.password_hash && password) {
    return bcrypt.compare(password, userRow.password_hash);
  }

  return false;
}

async function handleLogin(req, res, next, accountType, endpoint) {
  const { username, password } = req.body;
  const isPilotMode = process.env.PILOT_AUTH_BYPASS === 'true';
  const ipKey = requestIp(req);

  if (process.env.NODE_ENV === 'production' && isPilotMode) {
    return next({ status: 500, code: 'AUTH_ENVELOPE_BREACH', message: 'Deployment environment is misconfigured. Access halted.' });
  }

  try {
    const userRow = await resolveLoginCandidate(username, accountType);

    if (!userRow) {
      const alternateUser = await resolveAnyLoginCandidate(username);
      if (alternateUser && !roleAllowedForAccountType(alternateUser.role, accountType)) {
        const isAlternatePasswordValid = await verifyPasswordForUser(alternateUser, password, isPilotMode);
        if (isAlternatePasswordValid) {
          await writeBoundaryMismatchAudit({
            req,
            userRow: alternateUser,
            username,
            attemptedAccountType: accountType,
            endpoint
          });

          return authErr(req, res, 403, 'ACCOUNT_TYPE_MISMATCH',
            accountType === ACCOUNT_TYPES.PATIENT
              ? 'This account is not permitted on the patient login path.'
              : 'This account is not permitted on the staff login path.'
          );
        }

        await recordFailedPassword({ req, userRow: alternateUser, username, ipKey });
      } else {
        await recordUnknownLogin({ req, username });
      }

      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
    }

    const derivedAccountType = accountTypeForRole(userRow.role);
    if (derivedAccountType !== accountType) {
      await writeBoundaryMismatchAudit({
        req,
        userRow,
        username,
        attemptedAccountType: accountType,
        endpoint
      });

      return authErr(req, res, 403, 'ACCOUNT_TYPE_MISMATCH',
        accountType === ACCOUNT_TYPES.PATIENT
          ? 'This account is not permitted on the patient login path.'
          : 'This account is not permitted on the staff login path.'
      );
    }

    // Account disabled
    if (userRow.is_active === 0) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: username,
        action: 'SYS_AUTH_FAILED:INACTIVE',
        new_state: JSON.stringify({ username, ip: ipKey, outcome: 'inactive' })
      });
      return authErr(req, res, 401, 'ACCOUNT_DISABLED', 'This account has been disabled.');
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
      return authErr(req, res, 429, 'ACCOUNT_LOCKED',
        `Account temporarily locked. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        { retry_after_seconds: retryAfter }
      );
    }

    const isValidPassword = await verifyPasswordForUser(userRow, password, isPilotMode);

    if (!isValidPassword) {
      await recordFailedPassword({ req, userRow, username, ipKey });
      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
    }

    // Success — clear DB lockout state
    await run(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [userRow.id]);

    const { id: actorId, role, name } = userRow;
    const resolvedAccountType = accountTypeForRole(role);

    const accessToken = signAccessToken({ actorId, role, accountType: resolvedAccountType });

    // Issue refresh token
    const refreshToken = crypto.randomUUID();
    await run(
      `INSERT INTO refresh_tokens (id, user_id, expires_at, revoked, account_type) VALUES (?, ?, ?, 0, ?)`,
      [refreshToken, actorId, refreshTokenExpiresAt(), resolvedAccountType]
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
      account_type: resolvedAccountType.toLowerCase(),
      must_change_password: serializeMustChangePassword(userRow.must_change_password),
      _meta: {
        mode: isPilotMode ? 'PILOT_CONTROLLED' : 'RESTRICTED_DEPLOYMENT',
        safety: isPilotMode ? 'non-production' : 'hardened'
      }
    });
  } catch (err) {
    next(err);
  }
}

router.post('/login/patient', patientLoginRateLimit, async (req, res, next) => {
  await handleLogin(req, res, next, ACCOUNT_TYPES.PATIENT, '/api/v1/auth/login/patient');
});

router.post('/login/staff', staffLoginRateLimit, async (req, res, next) => {
  await handleLogin(req, res, next, ACCOUNT_TYPES.STAFF, '/api/v1/auth/login/staff');
});

router.post('/login', async (req, res, next) => {
  const accountType = normalizeAccountType(req.body?.account_type);
  if (!accountType) {
    return next({
      status: 400,
      code: 'ACCOUNT_TYPE_REQUIRED',
      message: 'Use /auth/login/staff or /auth/login/patient, or provide a valid account_type.'
    });
  }

  const limiter = accountType === ACCOUNT_TYPES.PATIENT
    ? patientLoginRateLimit
    : staffLoginRateLimit;

  return limiter(req, res, async (limitErr) => {
    if (limitErr) {
      return next(limitErr);
    }

    await handleLogin(req, res, next, accountType, '/api/v1/auth/login');
  });
});

router.post('/refresh', async (req, res, next) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refresh_token;

  if (!refreshToken) {
    return authErr(req, res, 401, 'REFRESH_REQUIRED', 'refresh_token is required.');
  }

  try {
    const tokenRow = await get(
      `SELECT rt.*, u.role, u.is_active, u.must_change_password FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.id = ?`,
      [refreshToken]
    );

    if (!tokenRow) {
      clearRefreshCookie(res);
      return authErr(req, res, 401, 'REFRESH_INVALID', 'Invalid refresh token.');
    }

    if (tokenRow.revoked === 1) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: tokenRow.user_id,
        action: 'SYS_AUTH_REFRESH:REVOKED_TOKEN_REUSE',
        new_state: JSON.stringify({ refresh_token_id: refreshToken })
      });
      clearRefreshCookie(res);
      return authErr(req, res, 401, 'REFRESH_REVOKED', 'Refresh token has been revoked.');
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refreshToken]);
      clearRefreshCookie(res);
      return authErr(req, res, 401, 'REFRESH_EXPIRED', 'Refresh token has expired. Please log in again.');
    }

    if (tokenRow.is_active === 0) {
      clearRefreshCookie(res);
      return authErr(req, res, 401, 'ACCOUNT_DISABLED', 'This account has been disabled.');
    }

    const storedAccountType = normalizeAccountType(tokenRow.account_type);
    const expectedAccountType = accountTypeForRole(tokenRow.role);
    if (!storedAccountType || storedAccountType !== expectedAccountType) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: tokenRow.user_id,
        action: 'SYS_AUTH_REFRESH:ACCOUNT_TYPE_MISMATCH',
        new_state: JSON.stringify({
          refresh_token_id: refreshToken,
          stored_account_type: tokenRow.account_type || null,
          actual_role: tokenRow.role
        })
      });
      clearRefreshCookie(res);
      return authErr(req, res, 401, 'REFRESH_SCOPE_INVALID', 'Session scope is invalid or outdated. Please log in again.');
    }

    await run(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`, [refreshToken]);
    const replacementRefreshToken = crypto.randomUUID();
    await run(
      `INSERT INTO refresh_tokens (id, user_id, expires_at, revoked, account_type) VALUES (?, ?, ?, 0, ?)`,
      [replacementRefreshToken, tokenRow.user_id, refreshTokenExpiresAt(), storedAccountType]
    );

    const newAccessToken = signAccessToken({
      actorId: tokenRow.user_id,
      role: tokenRow.role,
      accountType: storedAccountType
    });
    setRefreshCookie(res, replacementRefreshToken);
    setNoStore(res);

    res.json({
      access_token: newAccessToken,
      token_type: 'bearer',
      role: tokenRow.role.toLowerCase(),
      account_type: storedAccountType.toLowerCase(),
      must_change_password: serializeMustChangePassword(tokenRow.must_change_password)
    });
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
      logEvent('error', 'refresh_token_revoke_failed', { error: err.message });
    }
  }
  clearRefreshCookie(res);
  setNoStore(res);
  res.json({ message: 'Logged out.' });
});

router.get('/me', requireAuth, requireRole(['PATIENT', 'DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!userRow || userRow.is_active === 0) {
      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Identity not found or inactive.');
    }

    const expectedAccountType = accountTypeForRole(userRow.role);
    const tokenAccountType = normalizeAccountType(req.user.account_type);
    if (!expectedAccountType || tokenAccountType !== expectedAccountType) {
      await writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: req.user.id,
        patient_id: userRow.patient_id || null,
        action: 'SYS_AUTH_SESSION_SCOPE_MISMATCH',
        new_state: JSON.stringify({
          token_account_type: req.user.account_type || null,
          actual_role: userRow.role
        })
      });
      return authErr(req, res, 401, 'INVALID_SESSION_SCOPE', 'Session scope is invalid. Please log in again.');
    }

    setNoStore(res);
    return res.json({
      id: userRow.id,
      role: userRow.role.toLowerCase(),
      account_type: expectedAccountType.toLowerCase(),
      name: userRow.name,
      must_change_password: serializeMustChangePassword(userRow.must_change_password)
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return next({
      status: 400,
      code: 'MISSING_FIELDS',
      message: 'currentPassword and newPassword are required.'
    });
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return next({
      status: 400,
      code: 'WEAK_PASSWORD',
      message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    });
  }

  try {
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!userRow || userRow.is_active === 0) {
      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Identity not found or inactive.');
    }

    if (!userRow.password_hash) {
      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!isValidPassword) {
      return authErr(req, res, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await run(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newHash, req.user.id]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: userRow.patient_id || null,
      action: `SYS_AUTH_PASSWORD_CHANGE:${userRow.role}`,
      new_state: JSON.stringify({
        must_change_password: false,
        outcome: 'success'
      })
    });

    setNoStore(res);
    return res.json({ success: true, must_change_password: false });
  } catch (err) {
    next(err);
  }
});

router.get('/sse-token', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role, account_type: req.user.account_type, purpose: 'sse' },
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
