const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { db, transaction, endpoint, parse, now, id, fail, roles, actor, patientAccess, audit, event } = require('../opd/core.ts');

const router = express.Router();
router.use(requireAuth);
const schema = z.object({
  record_type: z.enum(['GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'TEMPERATURE', 'PULSE', 'SPO2', 'ACTIVITY']),
  timing_context: z.enum(['FASTING', 'BEFORE_BREAKFAST', 'AFTER_BREAKFAST', 'BEFORE_LUNCH', 'AFTER_LUNCH', 'BEFORE_DINNER', 'POST_DINNER', 'BEDTIME', 'RANDOM']).optional(),
  numeric_value: z.number().finite().optional(),
  secondary_numeric_value: z.number().finite().optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  activity_name: z.string().trim().min(1).max(120).optional(),
  duration_minutes: z.number().int().positive().max(1440).optional(),
  observed_at: z.iso.datetime(),
  patient_note: z.string().trim().max(1000).optional()
}).strict();

async function resolvePatientId(req) {
  const requested = String(req.params.patientId);
  if (req.user.role !== 'PATIENT' || requested !== req.user.id) return requested;
  return (await actor(req)).patient_id;
}

function validateRecord(value) {
  if (value.record_type === 'ACTIVITY') {
    if (!value.activity_name || !value.duration_minutes || value.numeric_value != null || value.secondary_numeric_value != null || value.unit) fail('INVALID_SELF_RECORD', 422);
  } else if (value.record_type === 'BLOOD_PRESSURE') {
    if (value.numeric_value == null || value.secondary_numeric_value == null || value.unit !== 'mmHg' || value.activity_name || value.duration_minutes) fail('INVALID_SELF_RECORD', 422);
  } else if (value.numeric_value == null || !value.unit || value.secondary_numeric_value != null || value.activity_name || value.duration_minutes) fail('INVALID_SELF_RECORD', 422);
  if (value.record_type === 'GLUCOSE' ? !value.timing_context : value.timing_context != null) fail('INVALID_TIMING_CONTEXT', 422);
}

router.get('/:patientId', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const patientId = await resolvePatientId(req);
  await patientAccess(req, patientId);
  res.json(await db.all('SELECT * FROM patient_self_records WHERE patient_id=? ORDER BY observed_at DESC,id DESC LIMIT 500', [patientId]));
}));

router.post('/:patientId', endpoint(async (req, res) => {
  roles(req, ['PATIENT']);
  const value = parse(schema, req.body);
  validateRecord(value);
  const row = await transaction(async tx => {
    const patientId = await resolvePatientId(req);
    await patientAccess(req, patientId, tx);
    const recordId = id('patient-record');
    const timestamp = now();
    await tx.run(`INSERT INTO patient_self_records (id,patient_id,record_type,timing_context,numeric_value,secondary_numeric_value,unit,activity_name,duration_minutes,observed_at,patient_note,provenance,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'PATIENT_SELF_RECORDED',?,?)`, [recordId, patientId, value.record_type, value.timing_context || null, value.numeric_value ?? null, value.secondary_numeric_value ?? null, value.unit || null, value.activity_name || null, value.duration_minutes || null, value.observed_at, value.patient_note || null, req.user.id, timestamp]);
    await audit(tx, req, 'PATIENT_SELF_RECORD_CREATED', patientId, { record_id: recordId, record_type: value.record_type, observed_at: value.observed_at });
    await event(tx, req, patientId, 'PATIENT_SELF_RECORD_CREATED', { record_id: recordId, record_type: value.record_type });
    return tx.get('SELECT * FROM patient_self_records WHERE id=?', [recordId]);
  });
  res.status(201).json(row);
}));

module.exports = router;
