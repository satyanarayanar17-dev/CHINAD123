const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

let notifications = [
  {
    id: 'notif-1', type: 'critical',
    title: 'Critical Lab: Potassium',
    body: 'Patient Ramesh Sivakumar — K+ 6.2 mEq/L (Critical High). Immediate review required.',
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    read: false, targetPatientId: 'pat-1'
  },
  {
    id: 'notif-2', type: 'info',
    title: 'Triage Complete',
    body: 'Nurse completed triage for Priya Nair. EWS: L4 — Less Urgent.',
    time: new Date(Date.now() - 15*60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    read: false, targetPatientId: 'pat-2'
  },
  {
    id: 'notif-3', type: 'appointment',
    title: 'New Patient Check-In',
    body: 'Arjun Krishnan has checked in at reception. Assigned to General Medicine queue.',
    time: new Date(Date.now() - 30*60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    read: true, targetPatientId: 'pat-3'
  }
];

router.get('/', requireAuth, (req, res) => res.json(notifications));

router.put('/', requireAuth, (req, res) => {
  if (Array.isArray(req.body)) notifications = req.body;
  res.json({ message: 'Notifications synced' });
});

module.exports = router;