const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

/**
 * In-process SSE client registry.
 * Map<userId, res> — one connection per user (newer connection wins).
 */
const clients = new Map();

/**
 * Broadcast a notification object to all connected SSE clients.
 * Called by writeNotification() in notifications.js after a DB write.
 * @param {object} notification
 */
function broadcastNotification(notification) {
  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  for (const [userId, res] of clients) {
    try {
      res.write(payload);
    } catch (err) {
      // Client socket already closed — clean up silently
      clients.delete(userId);
    }
  }
}

/**
 * GET /api/sse?token=<jwt>
 *
 * EventSource cannot set custom headers, so the JWT is passed as a
 * query parameter instead of Authorization: Bearer.
 *
 * Flow:
 *   1. Validate JWT from query param
 *   2. Set SSE response headers and flush
 *   3. Register client in the Map
 *   4. Send `connected` event
 *   5. Start 25-second heartbeat pings to prevent proxy timeouts
 *   6. On client disconnect, clear heartbeat and remove from Map
 */
router.get('/', (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'MISSING_TOKEN', message: 'token query parameter is required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Session expired or invalid token.' });
  }

  // SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx buffering SSE
  res.flushHeaders();

  // Register — newer connection for the same userId replaces the old one
  const previous = clients.get(decoded.id);
  if (previous) {
    try { previous.end(); } catch (_) { /* ignore */ }
  }
  clients.set(decoded.id, res);

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: decoded.id, role: decoded.role })}\n\n`);

  // Heartbeat every 25 seconds to prevent proxy / load-balancer timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch (err) {
      clearInterval(heartbeat);
      clients.delete(decoded.id);
    }
  }, 25000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(decoded.id);
  });
});

module.exports = { router, broadcastNotification };
