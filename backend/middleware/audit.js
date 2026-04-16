const { run } = require('../database');

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'new_password',
  'currentpassword',
  'current_password',
  'newpassword',
  'temporarypassword',
  'temporary_password',
  'otp',
  'otp_hash',
  'activation_code',
  'debug_otp',
  'refresh_token',
  'refresh_token_id',
  'access_token'
]);

function sanitizeAuditPayload(payload) {
  if (payload == null) {
    return payload;
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(sanitizeAuditPayload(parsed));
    } catch {
      return payload;
    }
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizeAuditPayload(entry));
  }

  if (typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => {
        const normalizedKey = key.replace(/[\s-]/g, '').toLowerCase();
        if (SENSITIVE_KEYS.has(normalizedKey)) {
          return [key, REDACTED_VALUE];
        }
        return [key, sanitizeAuditPayload(value)];
      })
    );
  }

  return payload;
}

function sanitizeAuditState(state) {
  const sanitized = sanitizeAuditPayload(state);
  if (sanitized == null) {
    return sanitized;
  }
  return typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
}

/**
 * Middleware to intercept and hard-write critical events to the Immutable Audit Log Database.
 * Must be mounted LAST in the router chain, after standard endpoints call next() 
 * and set req.auditEvent
 */
async function auditLogWriter(req, res, next) {
  if (req.auditEvent) {
    const { action, patient_id, prior_state, new_state } = req.auditEvent;
    const actor_id = req.user ? req.user.id : 'SYSTEM';
    const correlation_id = req.correlationId;

    try {
      await run(`
        INSERT INTO audit_logs (correlation_id, actor_id, patient_id, action, prior_state, new_state)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        correlation_id,
        actor_id,
        patient_id,
        action,
        sanitizeAuditState(prior_state),
        sanitizeAuditState(new_state)
      ]);
      
      console.log(`[AUDIT WRITTEN] ${action} | Actor: ${actor_id} | CID: ${correlation_id}`);
    } catch (err) {
      console.error(`[CRITICAL] FAILED TO WRITE AUDIT LOG:`, err);
    }
  }

  // Ensure JSON response is still sent if the previous route deferred it to the audit logger
  if (!res.headersSent) {
    res.json({ message: 'Success', audited: !!req.auditEvent });
  }
}

/**
 * Direct writer utility for Auth login failures/successes outside of normal flow.
 */
async function writeAuditDirect({
  correlation_id,
  actor_id,
  action,
  patient_id = null,
  prior_state = null,
  new_state = null
}) {
  try {
    await run(`
      INSERT INTO audit_logs (correlation_id, actor_id, patient_id, action, prior_state, new_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      correlation_id,
      actor_id || 'UNKNOWN',
      patient_id,
      action,
      sanitizeAuditState(prior_state),
      sanitizeAuditState(new_state)
    ]);
  } catch (err) {
    console.error(`[CRITICAL] FAILED TO WRITE AUDIT LOG:`, err);
  }
}

module.exports = {
  auditLogWriter,
  writeAuditDirect
};
