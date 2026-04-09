const { writeAuditDirect } = require('./audit');

const SKIP_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/login/patient',
  '/api/v1/auth/login/staff',
  '/api/v1/health'
];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Middleware: auto-audit all mutating requests after response is sent.
 * This is a safety net — explicit writeAuditDirect calls in routes remain
 * and provide richer context. This catches anything missed.
 */
function auditMutations(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (SKIP_PATHS.includes(req.path)) return next();

  res.on('finish', () => {
    // Only log successful mutations (2xx/3xx). Errors have their own audit path.
    if (res.statusCode >= 200 && res.statusCode < 400) {
      const actorId = req.user?.id || 'UNAUTHENTICATED';
      const action = `HTTP_${req.method}:${req.path}:${res.statusCode}`;
      writeAuditDirect({
        correlation_id: req.correlationId,
        actor_id: actorId,
        action
      }).catch(() => {}); // never let audit failure surface to caller
    }
  });

  next();
}

module.exports = { auditMutations };
