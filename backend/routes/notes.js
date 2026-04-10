const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run, all } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');
const {
  normalizeNoteStatus,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const {
  assertPatientRecord,
  loadPatientRecord,
  resolveSingleActiveEncounter
} = require('../lib/careFlow');

const router = express.Router();

async function loadNoteWithContext(noteId) {
  const note = await get(
    `SELECT cn.*, e.patient_id, e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged, p.id AS linked_patient_record_id
     FROM clinical_notes cn
     LEFT JOIN encounters e ON cn.encounter_id = e.id
     LEFT JOIN patients p ON p.id = e.patient_id
     WHERE cn.id = ?`,
    [noteId]
  );

  if (!note) {
    return { note: null, error: null };
  }

  const normalizedStatus = normalizeNoteStatus(note.status);
  if (!note.patient_id || !note.linked_patient_record_id || !normalizedStatus) {
    return {
      note,
      error: {
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Clinical note is linked to invalid encounter data.'
      }
    };
  }

  const encounterState = validateEncounterLifecycle({
    patient_id: note.patient_id,
    phase: note.encounter_phase,
    lifecycle_status: note.lifecycle_status,
    is_discharged: note.is_discharged
  });

  if (!encounterState.valid) {
    return {
      note,
      error: {
        status: 409,
        code: 'DATA_INTEGRITY_VIOLATION',
        message: 'Clinical note is linked to a malformed encounter.',
        details: encounterState.errors
      }
    };
  }

  note.status = normalizedStatus;
  return { note, error: null };
}

router.get('/:noteId', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  try {
    const { note, error } = await loadNoteWithContext(req.params.noteId);
    if (error) return next(error);
    if (!note) return next({ status: 404, code: 'NOT_FOUND', message: 'Note not found.' });
    res.json(note);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId, draft_content } = req.body;
  if (!patientId) return next({ status: 400, code: 'MISSING_PATIENT_ID' });
  try {
    const patient = await loadPatientRecord({ get }, patientId);
    assertPatientRecord(patient);

    const encounter = await resolveSingleActiveEncounter({ all }, patientId, {
      missingMessage: 'No active encounter for this patient.',
      malformedMessage: 'Active encounter is malformed and cannot accept notes.',
      duplicateMessage: 'Multiple active encounters exist for this patient. Repair the data before writing notes.'
    });
    const noteId = `note-${Date.now()}`;
    await run(
      `INSERT INTO clinical_notes (id,encounter_id,draft_content,status,author_id,__v) VALUES (?,?,?,'DRAFT',?,1)`,
      [noteId, encounter.id, draft_content || '', req.user.id]
    );
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patientId,
      action: `NOTE_CREATE:${noteId}`,
      new_state: JSON.stringify({ note_id: noteId, encounter_id: encounter.id, version: 1 })
    });
    res.json({ noteId, newVersion: 1 });
  } catch (err) { next(err); }
});

router.put('/:noteId', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { noteId } = req.params;
  const { draft_content, version } = req.body;
  if (!Number.isInteger(version)) return next({ status: 400, code: 'MISSING_VERSION' });
  try {
    const { note, error } = await loadNoteWithContext(noteId);
    if (error) return next(error);
    if (!note) return next({ status: 404, code: 'NOT_FOUND' });
    if (note.status === 'FINALIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Cannot edit a finalized note.' });
    if (note.__v !== version) return next({ status: 409, code: 'STALE_STATE', message: 'Conflict — another session updated this note.' });
    const updateResult = await run(
      `UPDATE clinical_notes SET draft_content=?, updated_at=CURRENT_TIMESTAMP, __v=__v+1 WHERE id=? AND __v=?`,
      [draft_content, noteId, version]
    );
    if (updateResult.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Conflict — another session updated this note.' });
    }
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: note.patient_id || null,
      action: `NOTE_SAVE:${noteId}`,
      new_state: JSON.stringify({ note_id: noteId, version: version + 1 })
    });
    res.json({ message: 'Note saved successfully', newVersion: version + 1 });
  } catch (err) { next(err); }
});

router.post('/:noteId/finalize', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { noteId } = req.params;
  const { version } = req.body;
  if (!Number.isInteger(version)) return next({ status: 400, code: 'MISSING_VERSION' });
  try {
    const { note, error } = await loadNoteWithContext(noteId);
    if (error) return next(error);
    if (!note) return next({ status: 404, code: 'NOT_FOUND' });
    if (note.status === 'FINALIZED') return next({ status: 422, code: 'INVALID_STATE', message: 'Already finalized.' });
    if (note.__v !== version) return next({ status: 409, code: 'STALE_STATE', message: 'Note modified. Review before finalizing.' });

    const finalizeResult = await run(
      `UPDATE clinical_notes SET status='FINALIZED', updated_at=CURRENT_TIMESTAMP, __v=__v+1 WHERE id=? AND __v=?`,
      [noteId, version]
    );
    if (finalizeResult.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Note modified. Review before finalizing.' });
    }

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: note.patient_id,
      action: `NOTE_FINALIZE:${noteId}`,
      new_state: JSON.stringify({ note_id: noteId, version: version + 1, status: 'FINALIZED' })
    });

    // Phase 2: Emit notification to nursing staff
    const patient = await get(`SELECT name FROM patients WHERE id = ?`, [note.patient_id]);
    await writeNotification({
      type: 'info',
      title: 'Clinical Note Finalized',
      body: `Dr. ${req.user.id} finalized a note for ${patient?.name || note.patient_id}.`,
      patient_id: note.patient_id,
      actor_id: req.user.id,
      target_role: 'NURSE'
    });

    res.json({ message: 'Note finalized successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
