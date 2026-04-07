const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all } = require('../database');

const router = express.Router();

function mapPatient(p) {
  return {
    id: p.id, name: p.name, mrn: p.id,
    age: p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : 0,
    dob: p.dob, gender: p.gender || 'Not specified',
    bloodGroup: 'Unknown',
    initials: p.name.split(' ').map(w => w[0]).join('').toUpperCase(),
    riskFlags: [], allergies: [],
    vitals: { bp: '120/80', hr: 72, temp: 37.0, spo2: 99 },
    activeMeds: []
  };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const patients = q.length >= 2
      ? await all(`SELECT id,name,dob,gender FROM patients WHERE name LIKE ? OR id LIKE ? LIMIT 20`, [`%${q}%`,`%${q}%`])
      : await all(`SELECT id,name,dob,gender FROM patients LIMIT 20`);
    res.json(patients.map(mapPatient));
  } catch (err) { next(err); }
});

router.get('/:patientId', requireAuth, async (req, res, next) => {
  try {
    const p = await get(`SELECT id,name,dob,gender FROM patients WHERE id = ?`, [req.params.patientId]);
    if (!p) return next({ status: 404, code: 'NOT_FOUND', message: 'Patient not found.' });
    res.json(mapPatient(p));
  } catch (err) { next(err); }
});

router.get('/:patientId/timeline', requireAuth, async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const encounters = await all(
      `SELECT id,phase,is_discharged,__v FROM encounters WHERE patient_id = ? ORDER BY id DESC`,
      [patientId]
    );

    const notes = await all(
      `SELECT cn.id,cn.draft_content,cn.status,cn.author_id,cn.created_at,cn.encounter_id
       FROM clinical_notes cn JOIN encounters e ON cn.encounter_id = e.id
       WHERE e.patient_id = ? AND cn.status = 'FINALIZED' ORDER BY cn.created_at DESC`,
      [patientId]
    );

    const rxRows = await all(
      `SELECT p.id,p.rx_content,p.status,p.authorizing_user_id,p.created_at,p.encounter_id
       FROM prescriptions p JOIN encounters e ON p.encounter_id = e.id
       WHERE e.patient_id = ? AND p.status = 'AUTHORIZED' ORDER BY p.created_at DESC`,
      [patientId]
    );

    const timeline = [];

    for (const enc of encounters) {
      timeline.push({
        id: `tl-enc-${enc.id}`, patientId,
        date: new Date().toISOString().split('T')[0],
        type: enc.is_discharged ? 'discharge' : 'encounter',
        title: enc.is_discharged ? 'Patient Discharged' : `Active Encounter — ${enc.phase}`,
        summary: `Encounter phase: ${enc.phase}. ${enc.is_discharged ? 'Encounter closed.' : 'Currently active.'}`,
        verifiedBy: 'System', encounterId: enc.id
      });
    }

    for (const note of notes) {
      let display = note.draft_content || 'No content recorded.';
      try {
        const p = JSON.parse(note.draft_content);
        if (p.soap) {
          const parts = [];
          if (p.soap.S) parts.push(`S: ${p.soap.S}`);
          if (p.soap.A) parts.push(`A: ${p.soap.A}`);
          if (p.soap.P) parts.push(`P: ${p.soap.P}`);
          if (parts.length) display = parts.join(' | ');
        }
      } catch (_) {}

      timeline.push({
        id: `tl-note-${note.id}`, patientId,
        date: note.created_at
          ? new Date(note.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
          : new Date().toISOString().split('T')[0],
        type: 'consultation',
        title: 'Clinical Consultation Note',
        summary: display.length > 300 ? display.substring(0, 300) + '...' : display,
        verifiedBy: note.author_id || 'Attending Physician',
        noteId: note.id, encounterId: note.encounter_id
      });
    }

    for (const rx of rxRows) {
      let display = rx.rx_content || 'Prescription details not available.';
      try {
        const p = JSON.parse(rx.rx_content);
        if (p.newRx && p.newRx.length > 0) display = p.newRx.map(m => m.name).join(', ');
      } catch (_) {}

      timeline.push({
        id: `tl-rx-${rx.id}`, patientId,
        date: rx.created_at
          ? new Date(rx.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
          : new Date().toISOString().split('T')[0],
        type: 'lab', title: 'Prescription Authorized',
        summary: display,
        verifiedBy: rx.authorizing_user_id || 'Attending Physician',
        rxId: rx.id, encounterId: rx.encounter_id
      });
    }

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(timeline);
  } catch (err) { next(err); }
});

router.post('/:patientId/break-glass', requireAuth, requireRole(['DOCTOR','NURSE']), async (req, res, next) => {
  const { patientId } = req.params;
  const { justification } = req.body;
  if (!justification || justification.trim().length < 10)
    return next({ status: 400, code: 'INSUFFICIENT_JUSTIFICATION', message: 'Minimum 10 characters required.' });
  try {
    const patient = await get(`SELECT id FROM patients WHERE id = ?`, [patientId]);
    if (!patient) return next({ status: 404, code: 'NOT_FOUND' });
    const { writeAuditDirect } = require('../middleware/audit');
    await writeAuditDirect({
      correlation_id: req.correlationId, actor_id: req.user.id, patient_id: patientId,
      action: `BREAK_GLASS:patient:${patientId}:reason:${justification.substring(0,200)}`
    });
    res.json({ granted: true, message: 'Emergency access granted. All actions are being recorded.',
      patientId, actor: req.user.id, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

module.exports = router;