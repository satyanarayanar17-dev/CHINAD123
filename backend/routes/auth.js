const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { get } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  const isPilotMode = process.env.PILOT_AUTH_BYPASS === 'true';

  // Strict enforcement: pilot bypass must never occur in production deployments.
  if (process.env.NODE_ENV === 'production' && isPilotMode) {
    return next({ status: 500, code: 'AUTH_ENVELOPE_BREACH', message: 'Deployment environment is misconfigured. Access halted.' });
  }

  try {
    let role = null;
    let actorId = null;
    let name = null;
    let isValidPassword = false;

    // 1. Staff authentication (Patients are disabled in Phase 1 Restricted Web Pilot)
    const userRow = await get(`SELECT * FROM users WHERE id = ?`, [username]);
    if (userRow) {
      // Account Lifecycle: Immediate rejection
      if (userRow.is_active === 0) {
        await writeAuditDirect({ correlation_id: req.correlationId, actor_id: username, action: 'SYS_AUTH_FAILED:INACTIVE' });
        return res.status(401).json({ error: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' });
      }

      // Legacy fallback exclusively for local sqlite dev mode before seeding passwords
      if (isPilotMode && process.env.NODE_ENV !== 'production' && !userRow.password_hash) {
        isValidPassword = true;
      } 
      // Real validation
      else if (userRow.password_hash && password) {
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
      _meta: { mode: isPilotMode ? 'PILOT_CONTROLLED' : 'RESTRICTED_DEPLOYMENT', safety: isPilotMode ? 'non-production' : 'hardened' }
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
    // Only resolve users (Staff). Patient profile resolution has been removed for Phase 1.
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
