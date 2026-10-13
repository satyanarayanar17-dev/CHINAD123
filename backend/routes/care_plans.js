const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { transaction, db, endpoint, parse, text, date, now, day, id, fail, roles, actor, patientAccess, audit, event } = require('../opd/core.ts');
const { addDays, TIME_RE } = require('../lib/carePlanSchedule');

const router = express.Router();
router.use(requireAuth);

const taskSchema = z.object({
  task_type: z.enum(['MEASUREMENT', 'ACTIVITY', 'MEDICATION', 'INSULIN']),
  title: text.max(160),
  instruction: text.max(1000),
  observation_type: z.string().trim().max(80).nullable().optional(),
  timing_relation: z.string().trim().max(80).nullable().optional(),
  target_unit: z.string().trim().max(40).nullable().optional(),
  prescription_item_id: z.string().trim().max(160).nullable().optional(),
  frequency_type: z.enum(['DAILY', 'SELECTED_DAYS', 'EVERY_N_DAYS', 'ONCE']),
  scheduled_time: z.string().regex(TIME_RE),
  weekdays_mask: z.number().int().min(1).max(127).nullable().optional(),
  interval_days: z.number().int().min(1).max(366).nullable().optional(),
  one_time_date: date.nullable().optional(),
  start_date: date,
  end_date: date.nullable().optional(),
  expected_duration_minutes: z.number().int().min(1).max(1440).nullable().optional(),
  window_before_minutes: z.number().int().min(0).max(1440).default(0),
  window_after_minutes: z.number().int().min(0).max(1440).default(120),
  reminder_enabled: z.boolean().default(true)
}).strict().superRefine((value, context) => {
  if (value.end_date && value.end_date < value.start_date) context.addIssue({ code: 'custom', message: 'end_date precedes start_date' });
  if (value.task_type === 'MEASUREMENT') {
    if (!value.observation_type || !value.timing_relation || !value.target_unit) context.addIssue({ code: 'custom', message: 'measurement contract required' });
    if (value.prescription_item_id) context.addIssue({ code: 'custom', message: 'measurement cannot reference prescription item' });
  } else if (value.task_type === 'MEDICATION' || value.task_type === 'INSULIN') {
    if (!value.prescription_item_id) context.addIssue({ code: 'custom', message: 'prescription item required' });
    if (value.observation_type) context.addIssue({ code: 'custom', message: 'medication cannot be measurement' });
  } else if (value.prescription_item_id || value.observation_type) context.addIssue({ code: 'custom', message: 'activity has incompatible fields' });
  if (value.frequency_type === 'SELECTED_DAYS' ? !value.weekdays_mask : value.weekdays_mask != null) context.addIssue({ code: 'custom', message: 'invalid weekdays_mask' });
  if (value.frequency_type === 'EVERY_N_DAYS' ? !value.interval_days : value.interval_days != null) context.addIssue({ code: 'custom', message: 'invalid interval_days' });
  if (value.frequency_type === 'ONCE' ? !value.one_time_date : value.one_time_date != null) context.addIssue({ code: 'custom', message: 'invalid one_time_date' });
});

async function ogDepartment(tx = db) {
  const department = await tx.get("SELECT * FROM departments WHERE name=? AND prefix=?", ['Obstetrics & Gynaecology', 'OBST']);
  if (!department) fail('OG_DEPARTMENT_NOT_CONFIGURED', 503);
  return department;
}

async function doctorContext(req, patientId, tx) {
  roles(req, ['DOCTOR']);
  await patientAccess(req, patientId, tx);
  const user = await actor(req, tx);
  const department = await ogDepartment(tx);
  if (user.department !== department.name) fail('PILOT_DEPARTMENT_ONLY', 422);
  return { user, department };
}

async function taskMedication(tx, patientId, task) {
  if (!['MEDICATION', 'INSULIN'].includes(task.task_type)) return task;
  const item = await tx.get(
    `SELECT i.*,d.name AS drug_name,d.strength,d.form,d.route,r.__v AS current_prescription_version
     FROM prescription_items i JOIN prescriptions r ON r.id=i.prescription_id
     JOIN encounters e ON e.id=r.encounter_id JOIN drug_catalog d ON d.id=i.drug_id
     WHERE i.id=? AND e.patient_id=? AND r.status='AUTHORIZED' AND i.prescription_version=r.__v`,
    [task.prescription_item_id, patientId]
  );
  if (!item) fail('PRESCRIPTION_ITEM_NOT_CURRENT', 409);
  return {
    ...task,
    title: `${item.drug_name} ${item.strength}`.trim(),
    instruction: [item.dose, item.frequency, item.duration, item.instructions].filter(Boolean).join(' · ')
  };
}

async function insertTask(tx, req, plan, rawTask, seriesId = id('care-task-series'), revision = 1, supersedes = null) {
  let task = parse(taskSchema, rawTask);
  task = await taskMedication(tx, plan.patient_id, task);
  const taskId = id('care-task');
  const timestamp = now();
  await tx.run(
    `INSERT INTO care_plan_tasks
     (id,series_id,revision,plan_id,supersedes_task_id,task_type,title,instruction,observation_type,timing_relation,target_unit,prescription_item_id,frequency_type,scheduled_time,weekdays_mask,interval_days,one_time_date,start_date,end_date,expected_duration_minutes,window_before_minutes,window_after_minutes,reminder_enabled,status,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?)`,
    [taskId, seriesId, revision, plan.id, supersedes, task.task_type, task.title, task.instruction,
      task.observation_type || null, task.timing_relation || null, task.target_unit || null, task.prescription_item_id || null,
      task.frequency_type, task.scheduled_time, task.weekdays_mask || null, task.interval_days || null, task.one_time_date || null,
      task.start_date, task.end_date || null, task.expected_duration_minutes || null, task.window_before_minutes,
      task.window_after_minutes, task.reminder_enabled ? 1 : 0, req.user.id, timestamp, timestamp]
  );
  return tx.get('SELECT * FROM care_plan_tasks WHERE id=?', [taskId]);
}

async function readModel(tx, patientId) {
  const plans = await tx.all('SELECT * FROM care_plans WHERE patient_id=? ORDER BY created_at DESC', [patientId]);
  if (!plans.length) return { plan: null, plans: [], tasks: [], available_prescription_items: [] };
  const tasks = await tx.all(
    `SELECT t.*,i.prescription_id,i.prescription_version,i.dose,i.frequency,i.duration,i.instructions AS medication_instructions,
            d.name AS drug_name,d.strength,d.form,d.route,r.__v AS current_prescription_version
     FROM care_plan_tasks t LEFT JOIN prescription_items i ON i.id=t.prescription_item_id
     LEFT JOIN drug_catalog d ON d.id=i.drug_id LEFT JOIN prescriptions r ON r.id=i.prescription_id
     WHERE t.plan_id IN (${plans.map(() => '?').join(',')}) ORDER BY t.series_id,t.revision`,
    plans.map(plan => plan.id)
  );
  const items = await tx.all(
    `SELECT i.*,d.name AS drug_name,d.strength,d.form,d.route,r.__v AS current_prescription_version
     FROM prescription_items i JOIN prescriptions r ON r.id=i.prescription_id
     JOIN encounters e ON e.id=r.encounter_id JOIN drug_catalog d ON d.id=i.drug_id
     WHERE e.patient_id=? AND r.status='AUTHORIZED' ORDER BY r.created_at DESC,i.ordinal`,
    [patientId]
  );
  return {
    plan: plans.find(plan => plan.status === 'ACTIVE') || null,
    plans,
    tasks: tasks.map(task => ({ ...task, medication_source_outdated: Boolean(task.prescription_item_id && task.prescription_version !== task.current_prescription_version) })),
    available_prescription_items: items
  };
}

router.get('/:patientId', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const requested = String(req.params.patientId);
  const user = req.user.role === 'PATIENT' && requested === req.user.id ? await actor(req) : null;
  const patientId = user?.patient_id || requested;
  await patientAccess(req, patientId);
  res.json(await readModel(db, patientId));
}));

router.post('/:patientId/review', endpoint(async (req, res) => {
  roles(req, ['DOCTOR', 'NURSE']);
  const patientId = String(req.params.patientId);
  await patientAccess(req, patientId);
  const reviewedThrough = parse(z.iso.datetime(), req.body.reviewed_through);
  await audit(db, req, 'CARE_PLAN_REVIEWED', patientId, { reviewed_through: reviewedThrough });
  res.json({ reviewed_through: reviewedThrough, changes_since_last_review: 0 });
}));

router.post('/:patientId', endpoint(async (req, res) => {
  const patientId = String(req.params.patientId);
  const result = await transaction(async tx => {
    const { department } = await doctorContext(req, patientId, tx);
    const value = parse(z.object({ start_date: date, end_date: date.nullable().optional(), department_id: text.optional() }).strict(), req.body);
    if (value.department_id && value.department_id !== department.id) fail('PILOT_DEPARTMENT_ONLY', 422);
    if (value.end_date && value.end_date < value.start_date) fail('INVALID_DATE_RANGE', 422);
    if (await tx.get("SELECT id FROM care_plans WHERE patient_id=? AND department_id=? AND status='ACTIVE'", [patientId, department.id])) fail('CARE_PLAN_ALREADY_ACTIVE', 409);
    const timestamp = now();
    const planId = id('care-plan');
    await tx.run("INSERT INTO care_plans (id,patient_id,department_id,status,timezone,start_date,end_date,created_by,created_at,updated_at,__v) VALUES (?,?,?,'ACTIVE','Asia/Kolkata',?,?,?,?,?,1)", [planId, patientId, department.id, value.start_date, value.end_date || null, req.user.id, timestamp, timestamp]);
    await audit(tx, req, 'CARE_PLAN_CREATED', patientId, { plan_id: planId, version: 1, department_id: department.id });
    await event(tx, req, patientId, 'CARE_PLAN_CREATED', { plan_id: planId, version: 1 });
    return tx.get('SELECT * FROM care_plans WHERE id=?', [planId]);
  });
  res.status(201).json({ care_plan: result });
}));

router.post('/:patientId/tasks', endpoint(async (req, res) => {
  const patientId = String(req.params.patientId);
  const result = await transaction(async tx => {
    await doctorContext(req, patientId, tx);
    const plan = await tx.get(`SELECT * FROM care_plans WHERE patient_id=? AND status='ACTIVE'${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [patientId]);
    if (!plan) fail('NOT_FOUND', 404);
    if (req.body.__v !== plan.__v) fail('STALE_STATE', 409);
    const task = await insertTask(tx, req, plan, req.body.task || req.body);
    const changed = await tx.run('UPDATE care_plans SET __v=__v+1,updated_at=? WHERE id=? AND __v=?', [now(), plan.id, plan.__v]);
    if (!changed.changes) fail('STALE_STATE', 409);
    await audit(tx, req, 'CARE_PLAN_TASK_CREATED', patientId, { plan_id: plan.id, plan_version: plan.__v + 1, task_id: task.id, series_id: task.series_id, revision: task.revision });
    await event(tx, req, patientId, 'CARE_PLAN_TASK_CREATED', { task_id: task.id, series_id: task.series_id, revision: task.revision });
    return { task, plan_version: plan.__v + 1 };
  });
  res.status(201).json({ care_plan: { __v: result.plan_version }, task: result.task });
}));

router.patch('/:patientId', endpoint(async (req, res) => {
  const patientId = String(req.params.patientId);
  const result = await transaction(async tx => {
    await doctorContext(req, patientId, tx);
    const plan = await tx.get(`SELECT * FROM care_plans WHERE patient_id=? AND status='ACTIVE'${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [patientId]);
    if (!plan) fail('NOT_FOUND', 404);
    if (req.body.__v !== plan.__v) fail('STALE_STATE', 409);
    const value = parse(z.object({ __v: z.number().int().positive(), status: z.literal('INACTIVE'), effective_date: date, reason: text }).strict(), req.body);
    if (value.effective_date < day()) fail('EFFECTIVE_DATE_CONFLICT', 409);
    if (await tx.get('SELECT a.id FROM care_plan_adherence a JOIN care_plan_tasks t ON t.id=a.task_id WHERE t.plan_id=? AND a.occurrence_date>=?', [plan.id, value.effective_date])) fail('EFFECTIVE_DATE_CONFLICT', 409);
    const endDate = addDays(value.effective_date, -1);
    if (endDate < plan.start_date) fail('EFFECTIVE_DATE_CONFLICT', 409);
    const changed = await tx.run("UPDATE care_plans SET status='INACTIVE',end_date=?,updated_at=?,__v=__v+1 WHERE id=? AND __v=?", [endDate, now(), plan.id, plan.__v]);
    if (!changed.changes) fail('STALE_STATE', 409);
    await tx.run("UPDATE care_plan_tasks SET status='INACTIVE',end_date=CASE WHEN start_date<? AND (end_date IS NULL OR end_date>?) THEN ? ELSE end_date END,updated_at=? WHERE plan_id=? AND status='ACTIVE'", [value.effective_date, endDate, endDate, now(), plan.id]);
    await audit(tx, req, 'CARE_PLAN_DEACTIVATED', patientId, { plan_id: plan.id, version: plan.__v + 1, effective_date: value.effective_date, reason: value.reason });
    await event(tx, req, patientId, 'CARE_PLAN_DEACTIVATED', { plan_id: plan.id, version: plan.__v + 1, effective_date: value.effective_date });
    return tx.get('SELECT * FROM care_plans WHERE id=?', [plan.id]);
  });
  res.json({ care_plan: result });
}));

router.patch('/tasks/:taskId', endpoint(async (req, res) => {
  const result = await transaction(async tx => {
    const current = await tx.get(
      `SELECT t.*,p.patient_id,p.__v AS plan_version,p.status AS plan_status FROM care_plan_tasks t JOIN care_plans p ON p.id=t.plan_id WHERE t.id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
      [req.params.taskId]
    );
    if (!current) fail('NOT_FOUND', 404);
    await doctorContext(req, current.patient_id, tx);
    if (current.plan_status !== 'ACTIVE') fail('PLAN_INACTIVE', 409);
    if (req.body.__v !== current.plan_version || req.body.expected_revision !== current.revision || current.status !== 'ACTIVE') fail('STALE_STATE', 409);
    const action = parse(z.enum(['REPLACE', 'DEACTIVATE']), req.body.action);
    const effectiveDate = parse(date, req.body.effective_date);
    if (effectiveDate < day()) fail('EFFECTIVE_DATE_CONFLICT', 409);
    if (await tx.get('SELECT id FROM care_plan_adherence WHERE task_id=? AND occurrence_date>=?', [current.id, effectiveDate])) fail('EFFECTIVE_DATE_CONFLICT', 409);
    const reason = parse(text, req.body.reason);
    const oldEnd = addDays(effectiveDate, -1);
    if (oldEnd < current.start_date) fail('EFFECTIVE_DATE_CONFLICT', 409);
    await tx.run('UPDATE care_plan_tasks SET status=?,end_date=?,updated_at=? WHERE id=? AND status=?', [action === 'REPLACE' ? 'SUPERSEDED' : 'INACTIVE', oldEnd, now(), current.id, 'ACTIVE']);
    let replacement = null;
    if (action === 'REPLACE') replacement = await insertTask(tx, req, { id: current.plan_id, patient_id: current.patient_id }, { ...req.body.task, start_date: effectiveDate }, current.series_id, current.revision + 1, current.id);
    const changed = await tx.run('UPDATE care_plans SET __v=__v+1,updated_at=? WHERE id=? AND __v=?', [now(), current.plan_id, current.plan_version]);
    if (!changed.changes) fail('STALE_STATE', 409);
    const auditContext = { reason, plan_id: current.plan_id, plan_version: current.plan_version + 1, prior_task_id: current.id, series_id: current.series_id, prior_revision: current.revision, task_id: replacement?.id || null, revision: replacement?.revision || null, effective_date: effectiveDate };
    await audit(tx, req, action === 'REPLACE' ? 'CARE_PLAN_TASK_REPLACED' : 'CARE_PLAN_TASK_DEACTIVATED', current.patient_id, auditContext);
    await event(tx, req, current.patient_id, action === 'REPLACE' ? 'CARE_PLAN_TASK_REPLACED' : 'CARE_PLAN_TASK_DEACTIVATED', auditContext);
    return { prior_task: await tx.get('SELECT * FROM care_plan_tasks WHERE id=?', [current.id]), task: replacement, care_plan: { id: current.plan_id, __v: current.plan_version + 1 } };
  });
  res.json(result);
}));

module.exports = router;
