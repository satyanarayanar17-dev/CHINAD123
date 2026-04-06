const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// In-memory notification store (per-session, resets on server restart)
// This is intentionally not in SQLite — notifications are ephemeral
let notifications = [
  {
    id: 'notif-1',
    type: 'lab_result',
    title: 'Critical Lab: Potassium',
    message: 'Patient Ramesh Sivakumar — K+ 6.2 mEq/L (Critical High)',
    timestamp: new Date().toISOString(),
    read: false,
    targetPatientId: 'pat-1',
    severity: 'critical'
  },
  {
    id: 'notif-2',
    type: 'triage',
    title: 'Triage Complete',
    message: 'Nurse QA completed triage for John Doe. EWS: L4.',
    timestamp: new Date().toISOString(),
    read: false,
    targetPatientId: 'pat-1',
    severity: 'info'
  }
];

// GET /api/notifications — polled every 3s by frontend
router.get('/', requireAuth, (req, res) => {
  res.json(notifications);
});

// PUT /api/notifications — sync updated read states
router.put('/', requireAuth, (req, res) => {
  if (Array.isArray(req.body)) {
    notifications = req.body;
  }
  res.json({ message: 'Notifications synced' });
});

module.exports = router;
