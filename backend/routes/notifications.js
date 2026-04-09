const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { all, run } = require('../database');

const router = express.Router();

/**
 * writeNotification — called by clinical routes to persist events to the DB
 * and push them to connected SSE clients in real time.
 *
 * target_role: 'DOCTOR' | 'NURSE' | 'ADMIN' | null (null = all staff)
 *
 * The SSE module is required lazily to avoid circular-dependency issues at
 * module load time (sse.js is loaded after notifications.js in server.js).
 */
async function writeNotification({ type = 'info', title, body, patient_id = null, actor_id = null, target_role = null }) {
  try {
    const result = await run(
      `INSERT INTO notifications (type, title, body, patient_id, actor_id, target_role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [type, title, body, patient_id, actor_id, target_role]
    );

    // Build broadcast object.
    // In SQLite: result.lastID is the auto-increment row id.
    // In PostgreSQL: result.lastID is null (run() abstraction limitation);
    //   we use a timestamp-based id for the SSE payload. The canonical id
    //   is served on the next poll from the DB.
    const notifId = result.lastID ? String(result.lastID) : String(Date.now());
    const notification = {
      id: notifId,
      type,
      title,
      body,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      read: false,
      targetPatientId: patient_id
    };

    try {
      const { broadcastNotification } = require('./sse');
      broadcastNotification(notification);
    } catch (err) {
      console.error('[SSE] broadcastNotification failed:', err.message);
    }
  } catch (err) {
    console.error('[NOTIFICATION] Failed to write notification:', err.message);
  }
}

/**
 * GET /api/notifications
 * Returns up to 50 most recent notifications, newest first.
 * Staff see notifications relevant to their role or all-staff notifications.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const role = req.user?.role || null;

    const notifications = await all(
      `SELECT id, type, title, body, patient_id, actor_id, read, created_at
       FROM notifications
       WHERE target_role IS NULL OR target_role = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [role]
    );

    // Normalise: SQLite stores read as 0/1; Postgres returns boolean.
    const normalised = notifications.map(n => ({
      ...n,
      id: String(n.id),
      read: n.read === 1 || n.read === true,
      time: new Date(n.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }));

    res.json(normalised);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    await run(`UPDATE notifications SET read = 1 WHERE id = ?`, [req.params.id]);
    res.json({ id: req.params.id, read: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the requesting user's role.
 */
router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    const role = req.user?.role || null;
    await run(
      `UPDATE notifications SET read = 1
       WHERE (target_role IS NULL OR target_role = ?) AND read = 0`,
      [role]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notifications
 * Legacy batch sync — kept for frontend compatibility during transition.
 */
router.put('/', requireAuth, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Expected array of notifications.' } });
    }
    for (const notif of req.body) {
      if (notif.id && notif.read === true) {
        await run(`UPDATE notifications SET read = 1 WHERE id = ?`, [notif.id]);
      }
    }
    res.json({ message: 'Notifications synced' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.writeNotification = writeNotification;
