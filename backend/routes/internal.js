const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditDirect } = require('../middleware/audit');
const { resetAndSeedDatabase } = require('../database');

const router = express.Router();

/**
 * POST /api/internal/seed-reset
 * 
 * SAFETY: Requires ADMIN authentication. Blocked in production.
 * In local_dev with ADMIN token, allows a full DB reset.
 * 
 * NEVER expose this endpoint production-friendly.
 */
router.post('/seed-reset', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const isSeedResetAllowed = process.env.ALLOW_SEED_RESET === 'true';
    const isLocalDev = (process.env.APP_ENV || 'local_dev') === 'local_dev';

    // HARD BLOCK: Cannot run without the explicit kill switch, and only in local_dev
    if (!isSeedResetAllowed || process.env.NODE_ENV === 'production' || !isLocalDev) {
      console.warn(`[SECURITY] Blocked seed-reset attempt by user ${req.user.id}.`);
      return next({
        status: 403,
        code: 'FORBIDDEN_ENV',
        message: 'Seed-reset is restricted to local_dev with ALLOW_SEED_RESET=true.'
      });
    }

    await resetAndSeedDatabase();

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: 'DB_SEED_RESET:by:' + req.user.id
    });

    res.json({ message: 'Verification environment successfully seeded and reset.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
