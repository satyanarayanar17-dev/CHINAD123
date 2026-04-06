const { run } = require('../database');

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
      `, [correlation_id, actor_id, patient_id, action, prior_state, new_state]);
      
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
async function writeAuditDirect({ correlation_id, actor_id, action, patient_id = null }) {
  try {
    await run(`
      INSERT INTO audit_logs (correlation_id, actor_id, patient_id, action)
      VALUES (?, ?, ?, ?)
    `, [correlation_id, actor_id || 'UNKNOWN', patient_id, action]);
  } catch (err) {
    console.error(`[CRITICAL] FAILED TO WRITE AUDIT LOG:`, err);
  }
}

module.exports = {
  auditLogWriter,
  writeAuditDirect
};
