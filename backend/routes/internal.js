const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditDirect } = require('../middleware/audit');
const { resetAndSeedDatabase } = require('../database');

const router = express.Router();

/**
 * POST /api/internal/seed-reset
 * 
 * SAFETY: Requires ADMIN authentication. Blocked in production.
 * In local_dev / local_pilot with ADMIN token, allows a full DB reset.
 * 
 * NEVER expose this endpoint production-friendly.
 */
router.post('/seed-reset', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const isSeedResetAllowed = process.env.ALLOW_SEED_RESET === 'true';

    // HARD BLOCK: Cannot run without the explicit kill switch, and absolutely never in production
    if (!isSeedResetAllowed || process.env.NODE_ENV === 'production') {
      console.warn(`[SECURITY] Blocked seed-reset attempt by user ${req.user.id}.`);
      return next({
        status: 403,
        code: 'FORBIDDEN_ENV',
        message: 'Seed-reset is disabled by environment configuration or blocked in production. Ops access required.'
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
