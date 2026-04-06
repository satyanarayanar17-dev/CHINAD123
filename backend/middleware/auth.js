const jwt = require('jsonwebtoken');

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
 * Validates JWT existence and signature.
 * Throws 401 if missing, expired, or invalid.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next({ status: 401, code: 'MISSING_TOKEN', message: 'No authorization token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    return next({ status: 401, code: 'INVALID_TOKEN', message: 'Session expired or invalid token.' });
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
  JWT_SECRET
};
