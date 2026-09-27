const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { transaction, db, endpoint, parse, now, id, fail, roles, actor, patientAccess, audit } = require('../opd/core.ts');
const { dateInZone, scheduledFor, scheduledOn, derivedStatus, DATE_RE } = require('../lib/carePlanSchedule');

const router = express.Router();
router.use(requireAuth);

async function requestedPatientId(req) {
  const requested = String(req.params.patientId);
  if (req.user.role !== 'PATIENT' || requested !== req.user.id) return requested;
  const user = await actor(req);
  return user.patient_id;
}

async function tasksForDate(tx, patientId, date) {
  const rows = await tx.all(
    `SELECT t.*,p.patient_id,p.timezone,p.start_date AS plan_start_date,p.end_date AS plan_end_date,
            i.prescription_id,i.prescription_version,i.dose,i.frequency,i.duration,i.instructions AS medication_instructions,
            d.name AS drug_name,d.strength,d.form,d.route,r.__v AS current_prescription_version
     FROM care_plan_tasks t JOIN care_plans p ON p.id=t.plan_id
     LEFT JOIN prescription_items i ON i.id=t.prescription_item_id
     LEFT JOIN drug_catalog d ON d.id=i.drug_id LEFT JOIN prescriptions r ON r.id=i.prescription_id
     WHERE p.patient_id=? AND p.status='ACTIVE' AND p.start_date<=? AND (p.end_date IS NULL OR p.end_date>=?)
     ORDER BY t.scheduled_time,t.series_id,t.revision`,
    [patientId, date, date]
  );
  return rows.filter(task => scheduledOn(task, date));
}

async function occurrenceDto(tx, task, date, response, at) {
  let observation = null;
  if (response) {
    observation = await tx.get('SELECT * FROM patient_observations WHERE adherence_id=?', [response.id]);
    if (observation) observation.components = await tx.all('SELECT component_code,numeric_value,unit FROM patient_observation_components WHERE observation_id=? ORDER BY component_code', [observation.id]);
  }
  return {
    id: response?.id || task.id,
    task_id: task.id,
    plan_id: task.plan_id,
    series_id: task.series_id,
    revision: task.revision,
    task_type: task.task_type,
    title: task.title,
    description: task.instruction,
    instruction: task.instruction,
    target_metric: task.observation_type && task.timing_relation ? `${task.timing_relation}_${task.observation_type}` : task.observation_type,
    observation_type: task.observation_type,
    timing_relation: task.timing_relation,
    target_unit: task.target_unit,
    occurrence_date: date,
    due_date: date,
    due_time: task.scheduled_time,
    scheduled_for: scheduledFor(date, task.scheduled_time),
    status: derivedStatus(task, date, response, at),
    response_status: response?.status || null,
    completed_at: response?.completed_at || null,
    recorded_at: response?.recorded_at || null,
    recorded_value: observation?.components?.[0]?.numeric_value ?? null,
    patient_note: response?.patient_note || null,
    __v: response?.__v || 0,
    observation,
    medication_source: task.prescription_item_id ? {
      prescription_id: task.prescription_id,
      prescription_item_id: task.prescription_item_id,
      prescription_version: task.prescription_version,
      drug_name: task.drug_name,
      strength: task.strength,
      form: task.form,
      route: task.route,
      dose: task.dose,
      frequency: task.frequency,
      duration: task.duration,
      instructions: task.medication_instructions,
      outdated: task.prescription_version !== task.current_prescription_version
    } : null
  };
}

router.get('/:patientId/today', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const patientId = await requestedPatientId(req);
  await patientAccess(req, patientId);
  const date = req.query.date ? parse(z.string().regex(DATE_RE), req.query.date) : dateInZone();
  const tasks = await tasksForDate(db, patientId, date);
  const responses = await db.all('SELECT * FROM care_plan_adherence WHERE patient_id=? AND occurrence_date=?', [patientId, date]);
  const byTask = new Map(responses.map(response => [response.task_id, response]));
  const at = new Date();
  res.json(await Promise.all(tasks.map(task => occurrenceDto(db, task, date, byTask.get(task.id), at))));
}));

router.get('/:patientId/timeline', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const patientId = await requestedPatientId(req);
  await patientAccess(req, patientId);
  const rows = await db.all(
    `SELECT a.*,t.task_type,t.title,t.instruction,t.series_id,t.revision,t.observation_type,t.timing_relation,
            i.prescription_id,i.prescription_version,i.dose,i.frequency,d.name AS drug_name
     FROM care_plan_adherence a JOIN care_plan_tasks t ON t.id=a.task_id
     LEFT JOIN prescription_items i ON i.id=t.prescription_item_id LEFT JOIN drug_catalog d ON d.id=i.drug_id
     WHERE a.patient_id=? ORDER BY a.recorded_at DESC,a.id DESC LIMIT 500`,
    [patientId]
  );
  for (const row of rows) {
    const observation = await db.get('SELECT * FROM patient_observations WHERE adherence_id=?', [row.id]);
    if (observation) observation.components = await db.all('SELECT component_code,numeric_value,unit FROM patient_observation_components WHERE observation_id=? ORDER BY component_code', [observation.id]);
    row.observation = observation || null;
  }
  res.json(rows);
}));

const recordSchema = z.object({
  __v: z.number().int().min(0).optional(),
  date: z.string().regex(DATE_RE).optional(),
  status: z.enum(['RECORDED', 'COMPLETED', 'TAKEN', 'SKIPPED']),
  value: z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  unit: z.string().trim().max(40).optional(),
  observed_at: z.iso.datetime().optional(),
  completed_at: z.iso.datetime().optional(),
  note: z.string().trim().max(1000).optional()
}).strict();

router.post('/:resourceId/record', endpoint(async (req, res) => {
  roles(req, ['PATIENT']);
  const input = parse(recordSchema, req.body);
  const result = await transaction(async tx => {
    let existing = await tx.get(`SELECT * FROM care_plan_adherence WHERE id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [req.params.resourceId]);
    let task;
    let date;
    if (existing) {
      task = await tx.get('SELECT t.*,p.patient_id,p.status AS plan_status,p.start_date AS plan_start_date,p.end_date AS plan_end_date FROM care_plan_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=?', [existing.task_id]);
      date = existing.occurrence_date;
    } else {
      task = await tx.get('SELECT t.*,p.patient_id,p.status AS plan_status,p.start_date AS plan_start_date,p.end_date AS plan_end_date FROM care_plan_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=?', [req.params.resourceId]);
      date = input.date || dateInZone();
    }
    if (!task) fail('NOT_FOUND', 404);
    await patientAccess(req, task.patient_id, tx);
    if (task.plan_status !== 'ACTIVE' || !scheduledOn(task, date) || date < task.plan_start_date || (task.plan_end_date && date > task.plan_end_date)) fail('TASK_NO_LONGER_ACTIVE', 409);
    const currentState = derivedStatus(task, date, existing, new Date());
    if (!existing && currentState !== 'DUE') fail('TASK_NOT_DUE', 409);
    const allowed = task.task_type === 'MEASUREMENT' ? ['RECORDED', 'SKIPPED'] : task.task_type === 'ACTIVITY' ? ['COMPLETED', 'SKIPPED'] : ['TAKEN', 'SKIPPED'];
    if (!allowed.includes(input.status)) fail('INVALID_TASK_STATUS', 422);
    if (task.task_type === 'MEASUREMENT' && input.status === 'RECORDED' && input.value == null) fail('OBSERVATION_REQUIRED', 422);
    if (task.task_type !== 'MEASUREMENT' && (input.value != null || input.unit || input.observed_at)) fail('OBSERVATION_NOT_ALLOWED', 422);
    const version = input.__v ?? 0;
    if ((existing?.__v || 0) !== version) fail('STALE_STATE', 409);
    const timestamp = now();
    const completedAt = input.status === 'SKIPPED' ? null : (input.completed_at || timestamp);
    if (existing) {
      const changed = await tx.run('UPDATE care_plan_adherence SET status=?,completed_at=?,recorded_at=?,patient_note=?,__v=__v+1 WHERE id=? AND __v=?', [input.status, completedAt, timestamp, input.note || null, existing.id, version]);
      if (!changed.changes) fail('STALE_STATE', 409);
    } else {
      const responseId = id('care-response');
      try {
        await tx.run('INSERT INTO care_plan_adherence (id,task_id,patient_id,occurrence_date,scheduled_for,status,completed_at,recorded_at,patient_note,__v) VALUES (?,?,?,?,?,?,?,?,?,1)', [responseId, task.id, task.patient_id, date, scheduledFor(date, task.scheduled_time), input.status, completedAt, timestamp, input.note || null]);
      } catch (error) {
        if (String(error.message).includes('UNIQUE') || error.code === '23505') fail('STALE_STATE', 409);
        throw error;
      }
      existing = await tx.get('SELECT * FROM care_plan_adherence WHERE id=?', [responseId]);
    }
    const response = await tx.get('SELECT * FROM care_plan_adherence WHERE task_id=? AND occurrence_date=?', [task.id, date]);
    let observation = await tx.get('SELECT * FROM patient_observations WHERE adherence_id=?', [response.id]);
    if (task.task_type === 'MEASUREMENT' && input.status === 'RECORDED') {
      const numeric = Number(input.value);
      if (!Number.isFinite(numeric)) fail('INVALID_MEASUREMENT_COMPONENT', 422);
      const unit = input.unit || task.target_unit;
      if (unit !== task.target_unit) fail('INVALID_UNIT', 422);
      if (!observation) {
        const observationId = id('observation');
        await tx.run('INSERT INTO patient_observations (id,adherence_id,observation_type,timing_relation,observed_at,recorded_at) VALUES (?,?,?,?,?,?)', [observationId, response.id, task.observation_type, task.timing_relation, input.observed_at || completedAt, timestamp]);
        observation = await tx.get('SELECT * FROM patient_observations WHERE id=?', [observationId]);
      } else {
        await tx.run('UPDATE patient_observations SET observed_at=?,recorded_at=? WHERE id=?', [input.observed_at || completedAt, timestamp, observation.id]);
        await tx.run('DELETE FROM patient_observation_components WHERE observation_id=?', [observation.id]);
      }
      await tx.run('INSERT INTO patient_observation_components (observation_id,component_code,numeric_value,unit) VALUES (?,?,?,?)', [observation.id, task.observation_type, numeric, unit]);
    } else if (observation) {
      await tx.run('DELETE FROM patient_observation_components WHERE observation_id=?', [observation.id]);
      await tx.run('DELETE FROM patient_observations WHERE id=?', [observation.id]);
      observation = null;
    }
    await audit(tx, req, 'CARE_PLAN_RESPONSE_RECORDED', task.patient_id, { response_id: response.id, task_id: task.id, series_id: task.series_id, revision: task.revision, occurrence_date: date, status: input.status, response_version: response.__v });
    return occurrenceDto(tx, task, date, response, new Date());
  });
  res.json(await result);
}));

module.exports = router;
