const jwt = require('jsonwebtoken');
const { get } = require('../database');

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

/**
 * Clear a user's revocation cache entry.
 * Called by admin.js when a user is re-enabled so the cache does not
 * incorrectly block a freshly-issued token.
 */
function clearRevocationCache(userId) {
  revocationCache.delete(userId);
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
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next({ status: 401, code: 'MISSING_TOKEN', message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return next({ status: 401, code: 'INVALID_TOKEN', message: 'Session expired or invalid token.' });
  }

  req.user = decoded; // { id, role, iat, exp }

  // ── Token revocation check ─────────────────────────────────────────────────
  try {
    const now = Date.now();
    const cached = revocationCache.get(decoded.id);

    let revokedAt = null;

    if (cached && (now - cached.cachedAt) < REVOCATION_CACHE_TTL_MS) {
      // Serve from cache — avoids a DB round-trip on every request
      revokedAt = cached.revokedAt;
    } else {
      // Cache miss or expired — check the DB
      const row = await get(`SELECT revoked_at FROM revoked_tokens WHERE user_id = ?`, [decoded.id]);
      revokedAt = row ? row.revoked_at : null;
      revocationCache.set(decoded.id, { revokedAt, cachedAt: now });
    }

    if (revokedAt) {
      const revokedAtMs = new Date(revokedAt).getTime();
      const tokenIssuedAtMs = decoded.iat * 1000; // JWT iat is in seconds

      if (revokedAtMs > tokenIssuedAtMs) {
        // Token was issued before the user was disabled — reject it
        return next({
          status: 401,
          code: 'TOKEN_REVOKED',
          message: 'Your session has been revoked by an administrator. Please contact support.'
        });
      }
    }
  } catch (err) {
    // Fail open: if the revocation DB check errors, allow the request through
    // rather than causing an outage. Log loudly.
    console.error(`[AUTH] Revocation check failed for user ${decoded.id}:`, err.message);
  }

  next();
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
      console.error(`[SECURITY] User ${req.user.id} (${req.user.role}) attempted unauthorized access. CID: ${req.correlationId}`);
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
  clearRevocationCache
};
