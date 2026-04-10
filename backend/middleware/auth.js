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
  const tokenIssuedAtMs = decoded.iat * 1000;

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
      throw err;
    }
    console.error(`[AUTH] Revocation check failed for user ${decoded.id}:`, err.message);
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
    req.user = decoded;
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
  authenticateToken,
  extractBearerToken
};
