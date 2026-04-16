const jwt = require('jsonwebtoken');
const { get } = require('../database');
const { accountTypeForRole, normalizeAccountType } = require('../lib/authBoundary');
const { logEvent } = require('../lib/logger');

// In production: JWT_SECRET MUST be set — no fallback permitted.
// In local_dev: fallback to insecure default with a loud warning (already issued in server.js).
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV !== 'production'
    ? 'dev-only-insecure-fallback-do-not-use-in-pilot'
    : null
);

// Belt-and-suspenders: if we somehow reach this in production without a secret, abort.
if (!JWT_SECRET) {
  console.error('[FATAL] middleware/auth.js: JWT_SECRET is null in production. Aborting.');
  process.exit(1);
}

/**
 * In-process cache for token revocation state.
 * Stores the most recently looked-up revoked_at per userId.
 * TTL: 60 seconds — worst-case lag between disable and enforcement.
 *
 * Cache entry: { revokedAt: string | null, cachedAt: number (ms) }
 */
const revocationCache = new Map();
const REVOCATION_CACHE_TTL_MS = 60 * 1000;
const MUST_CHANGE_PASSWORD_ALLOWED_PATHS = new Set([
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
  '/api/v1/auth/me'
]);

function tokenError(status, code, message) {
  return { status, code, message };
}

/**
 * Clear a user's revocation cache entry.
 * Called by admin.js when a user is re-enabled so the cache does not
 * incorrectly block a freshly-issued token.
 */
function clearRevocationCache(userId) {
  revocationCache.delete(userId);
}

function setRevocationCache(userId, revokedAt) {
  revocationCache.set(userId, {
    revokedAt: revokedAt || null,
    cachedAt: Date.now()
  });
}

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
}

function enforceTokenScope(decoded) {
  const expectedAccountType = accountTypeForRole(decoded.role);
  if (!expectedAccountType) {
    return decoded;
  }

  const tokenAccountType = normalizeAccountType(decoded.account_type);
  if (tokenAccountType !== expectedAccountType) {
    logEvent('warn', 'token_scope_mismatch', {
      userId: decoded.id,
      role: decoded.role,
      tokenAccountType: decoded.account_type,
      expectedAccountType
    });
    throw tokenError(401, 'INVALID_TOKEN_SCOPE', 'Session scope is invalid. Please log in again.');
  }

  return decoded;
}

async function enforceRevocation(decoded) {
  const now = Date.now();
  const cached = revocationCache.get(decoded.id);

  let revokedAt = null;

  if (cached && (now - cached.cachedAt) < REVOCATION_CACHE_TTL_MS) {
    revokedAt = cached.revokedAt;
  } else {
    const row = await get(`SELECT revoked_at FROM revoked_tokens WHERE user_id = ?`, [decoded.id]);
    revokedAt = row ? row.revoked_at : null;
    revocationCache.set(decoded.id, { revokedAt, cachedAt: now });
  }

  if (!revokedAt) {
    return decoded;
  }

  const revokedAtMs = new Date(revokedAt).getTime();
  const tokenIssuedAtMs = Number.isFinite(decoded.session_iat_ms)
    ? decoded.session_iat_ms
    : decoded.iat * 1000;

  if (revokedAtMs > tokenIssuedAtMs) {
    throw tokenError(
      401,
      'TOKEN_REVOKED',
      'Your session has been revoked by an administrator. Please contact support.'
    );
  }

  return decoded;
}

async function authenticateToken(token, options = {}) {
  if (!token) {
    throw tokenError(401, 'MISSING_TOKEN', 'No authorization token provided.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw tokenError(401, 'INVALID_TOKEN', 'Session expired or invalid token.');
  }

  try {
    await enforceRevocation(decoded);
  } catch (err) {
    if (err.status) {
      // Known auth error (e.g. TOKEN_REVOKED) — propagate as-is.
      throw err;
    }

    // Unexpected error during revocation DB check (pool exhaustion, network blip, etc.).
    // Strategy: use the stale in-process cache entry if one exists for this user,
    // so active clinical staff are not locked out during a transient DB hiccup.
    // If no cache entry exists at all, we have zero prior knowledge — fail closed.
    const staleEntry = revocationCache.get(decoded.id);

    if (staleEntry) {
      logEvent('warn', 'revocation_check_degraded', {
        userId: decoded.id,
        cachedRevokedAt: staleEntry.revokedAt,
        cacheAgeMs: Date.now() - staleEntry.cachedAt,
        error: err.message
      });

      // If the stale cache shows a prior revocation, enforce it even though the
      // DB re-check failed — better to block a potentially revoked token than
      // to allow it through.
      if (staleEntry.revokedAt) {
        const revokedAtMs = new Date(staleEntry.revokedAt).getTime();
        const tokenIssuedAtMs = Number.isFinite(decoded.session_iat_ms)
          ? decoded.session_iat_ms
          : decoded.iat * 1000;
        if (revokedAtMs > tokenIssuedAtMs) {
          throw tokenError(401, 'TOKEN_REVOKED', 'Your session has been revoked. Please contact support.');
        }
      }
      // Stale cache shows no revocation — allow through under degraded mode.
    } else {
      // No prior knowledge of this user's revocation state. Fail closed.
      logEvent('error', 'revocation_check_failed_no_cache', {
        userId: decoded.id,
        error: err.message
      });
      throw tokenError(503, 'SERVICE_UNAVAILABLE', 'Authentication service is temporarily unavailable. Please try again shortly.');
    }
  }

  if (options.expectedPurpose && decoded.purpose !== options.expectedPurpose) {
    throw tokenError(401, 'INVALID_TOKEN_PURPOSE', 'Token is not valid for this operation.');
  }

  enforceTokenScope(decoded);

  if (options.allowedRoles && !options.allowedRoles.includes(decoded.role)) {
    throw tokenError(403, 'FORBIDDEN_ROLE', `Action requires one of: ${options.allowedRoles.join(', ')}`);
  }

  return decoded;
}

function isMustChangePasswordBypassPath(req) {
  const path = req.originalUrl?.split('?')[0] || req.path || '';
  return MUST_CHANGE_PASSWORD_ALLOWED_PATHS.has(path);
}

async function enforceCurrentUserState(req, decoded) {
  const userRow = await get(
    `SELECT id, role, is_active, must_change_password
     FROM users
     WHERE id = ?`,
    [decoded.id]
  );

  if (!userRow || userRow.is_active === 0) {
    throw tokenError(401, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }

  if (userRow.role !== decoded.role) {
    throw tokenError(401, 'INVALID_SESSION_SCOPE', 'Session scope is invalid. Please log in again.');
  }

  if ((userRow.must_change_password === 1 || userRow.must_change_password === true) && !isMustChangePasswordBypassPath(req)) {
    throw tokenError(
      403,
      'PASSWORD_CHANGE_REQUIRED',
      'Password change is required before accessing the application.'
    );
  }

  return {
    ...decoded,
    must_change_password: userRow.must_change_password === 1 || userRow.must_change_password === true
  };
}

/**
 * Validates JWT existence and signature, then checks the revoked_tokens
 * table to enforce immediate token invalidation when a user is disabled.
 *
 * Throws 401 if:
 *   - Token is missing
 *   - Token is expired or invalid
 *   - A revocation record exists with revoked_at > token.iat (issued-at)
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    const decoded = await authenticateToken(token);
    req.user = await enforceCurrentUserState(req, decoded);
    next();
  } catch (err) {
    next(err.status ? err : tokenError(500, 'AUTH_FAILURE', err.message));
  }
}

/**
 * Generates an Express middleware that strictly enforces allowed roles.
 * Throws 403 if user role is not in the allowed list.
 * @param {string[]} allowedRoles e.g. ['DOCTOR', 'ADMIN']
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next({ status: 401, code: 'MISSING_ROLE', message: 'Token lacks role claim.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logEvent('warn', 'route_role_violation', {
        correlationId: req.correlationId,
        userId: req.user.id,
        role: req.user.role,
        allowedRoles
      });
      return next({
        status: 403,
        code: 'FORBIDDEN_ROLE',
        message: `Action requires one of: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET,
  clearRevocationCache,
  setRevocationCache,
  authenticateToken,
  extractBearerToken
};
