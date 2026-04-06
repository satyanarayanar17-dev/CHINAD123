const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');

const router = express.Router();

// GET NOTE BY ID
router.get('/:noteId', requireAuth, async (req, res, next) => {
  try {
    const note = await get(`SELECT cn.*, e.patient_id FROM clinical_notes cn JOIN encounters e ON cn.encounter_id = e.id WHERE cn.id = ?`, [req.params.noteId]);
    if (!note) return next({ status: 404, code: 'NOT_FOUND', message: 'Note not found.' });
    res.json(note);
  } catch (err) {
    next(err);
  }
});

// CREATE NEW NOTE (Finds active encounter for patient)
router.post('/', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId, draft_content } = req.body;
  if (!patientId) return next({ status: 400, code: 'MISSING_PATIENT_ID' });

  try {
    // Find active encounter
    const encounter = await get(`SELECT id FROM encounters WHERE patient_id = ? AND is_discharged = 0 ORDER BY id DESC LIMIT 1`, [patientId]);
    if (!encounter) return next({ status: 422, code: 'NO_ACTIVE_ENCOUNTER', message: 'Patient does not have an active encounter.' });

    const noteId = `note-${Date.now()}`;
    await run(`INSERT INTO clinical_notes (id, encounter_id, draft_content, status, __v) VALUES (?, ?, ?, 'DRAFT', 1)`, [noteId, encounter.id, draft_content || '']);
    
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `NOTE_CREATE:${noteId}`
    });

    res.json({ noteId, newVersion: 1 });
  } catch (err) {
    next(err);
  }
});

// UPDATE DRAFT NOTE
router.put('/:noteId', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { noteId } = req.params;
  const { draft_content, version } = req.body;

  if (version === undefined) {
    return next({ status: 400, code: 'MISSING_VERSION', message: 'OCC requires version payload.' });
  }

  try {
    const note = await get(`SELECT * FROM clinical_notes WHERE id = ?`, [noteId]);
    if (!note) return next({ status: 404, code: 'NOT_FOUND', message: 'Note not found.' });

    // State Guard
    if (note.status === 'FINALIZED') {
      return next({ status: 422, code: 'INVALID_STATE', message: 'Cannot edit a finalized note.' });
    }

    // OCC Version Guard
    if (note.__v !== version) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Draft conflict. Another session updated this note.' });
    }

    await run(`
      UPDATE clinical_notes 
      SET draft_content = ?, __v = __v + 1 
      WHERE id = ? AND __v = ?
    `, [draft_content, noteId, version]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `NOTE_SAVE:${noteId}`
    });

    res.json({ message: 'Note saved successfully', newVersion: version + 1 });
  } catch (err) {
    next(err);
  }
});

// FINALIZE NOTE
router.post('/:noteId/finalize', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { noteId } = req.params;
  const { version } = req.body;

  if (version === undefined) return next({ status: 400, code: 'MISSING_VERSION', message: 'Required.' });

  try {
    const note = await get(`SELECT * FROM clinical_notes WHERE id = ?`, [noteId]);
    if (!note) return next({ status: 404, code: 'NOT_FOUND' });

    // State Guard prevents double submit
    if (note.status === 'FINALIZED') {
      return next({ status: 422, code: 'INVALID_STATE', message: 'Note is already finalized.' });
    }

    // Version guard required even for finalization to prevent finalizing an old state
    if (note.__v !== version) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Note modified. Review latest before finalizing.' });
    }

    await run(`UPDATE clinical_notes SET status = 'FINALIZED', __v = __v + 1 WHERE id = ? AND __v = ?`, [noteId, version]);
    
    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `NOTE_FINALIZE:${noteId}`
    });

    res.json({ message: 'Note finalized successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
