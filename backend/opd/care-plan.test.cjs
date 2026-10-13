const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'restricted_web_pilot') throw Error('Local tests only');
if (process.env.OPD_TEST_POSTGRES === 'true' && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB || '') || new URL(process.env.DATABASE_URL).pathname !== '/' + process.env.CC_ISOLATED_TEST_DB)) throw Error('PostgreSQL acceptance requires scripts/isolated-postgres.cjs');
if (process.env.OPD_TEST_POSTGRES !== 'true') {
  process.env.DB_DIALECT = 'sqlite';
  process.env.SQLITE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-care-plan-test-')), 'test.db');
}
process.env.NODE_ENV = 'test';
process.env.ENABLE_LEGACY_API = 'true';
process.env.OPD_NOTIFICATION_WORKER = 'false';

const app = require('../server');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const { withTransaction } = db;
const { writePrescriptionItems } = require('../lib/prescriptionItems');
const schedule = require('../lib/carePlanSchedule');
const { runNotificationCycle } = require('./notifications.ts');

const token = (id, role) => jwt.sign({ id, role, account_type: role === 'PATIENT' ? 'PATIENT' : 'STAFF' }, JWT_SECRET, { expiresIn: '1h' });
const auth = value => ({ Authorization: `Bearer ${value}` });
async function call(who, method, url, body, status = 200) {
  const response = await request(app)[method](`/api/v1/opd${url}`).set(auth(who)).send(body);
  assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(response.body)}`);
  return response.body;
}
const plusMinutes = (at, minutes) => new Date(at.getTime() + minutes * 60000);
const localTime = at => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

async function seed() {
  await db.migrateDatabase();
  const og = await db.get("SELECT * FROM departments WHERE prefix='OBST'");
  await db.run("INSERT INTO departments (id,name,prefix) VALUES ('other-dept','General Medicine','GM')");
  for (const [id, name, phone] of [['patient-a','Patient A','+919100000001'],['patient-b','Patient B','+919100000002']]) {
    await db.run('INSERT INTO patients (id,mrn,name,phone,dob,gender) VALUES (?,?,?,?,?,?)', [id, `MRN-${id}`, name, phone, '1990-01-01', 'Female']);
  }
  for (const user of [
    ['patient-user-a','PATIENT','Patient A',null,'patient-a'],['patient-user-b','PATIENT','Patient B',null,'patient-b'],
    ['doctor-a','DOCTOR','Doctor A',og.name,null],['doctor-other','DOCTOR','Doctor Other',og.name,null],
    ['nurse-a','NURSE','Nurse A',og.name,null],['nurse-other','NURSE','Nurse Other','General Medicine',null],
    ['admin-a','ADMIN','Admin A',og.name,null]
  ]) await db.run('INSERT INTO users (id,role,name,department,patient_id,is_active,must_change_password) VALUES (?,?,?,?,?,1,0)', user);
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged,assigned_doctor_id,created_at) VALUES ('enc-rx','patient-a','DISCHARGED','DISCHARGED',1,'doctor-a',?)", [new Date().toISOString()]);
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged,assigned_doctor_id,created_at) VALUES ('enc-active','patient-a','RECEPTION','RECEPTION',0,'doctor-a',?)", [new Date().toISOString()]);
  await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,encounter_id,created_by,created_at) VALUES ('apt-active','patient-a','doctor-a',?,?,?,'OG 1','CHECKED_IN','Synthetic care-plan acceptance','enc-active','admin-a',?)", [og.id, new Date().toISOString(), plusMinutes(new Date(), 30).toISOString(), new Date().toISOString()]);
  await db.run("INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES ('enc-active','apt-active',?,'OBST-001',?,'WAITING',?,'admin-a',1)", [og.id, schedule.dateInZone(), new Date().toISOString()]);
  await db.run("INSERT INTO drug_catalog (id,name,strength,form,route,active) VALUES ('drug-med','Metformin','500 mg','Tablet','Oral',1)");
  await db.run("INSERT INTO drug_catalog (id,name,strength,form,route,active) VALUES ('drug-insulin','Synthetic Insulin','100 units/mL','Injection','Subcutaneous',1)");
  const content = { medications: [
    { drug_id: 'drug-med', dose: '1 tablet', frequency: 'Once daily', duration: '30 days', instructions: 'After food' },
    { drug_id: 'drug-insulin', dose: '4 units', frequency: 'At bedtime', duration: '30 days', instructions: 'Use prescribed dose only' }
  ], validation: { signed_by: 'doctor-a' } };
  await db.run("INSERT INTO prescriptions (id,encounter_id,rx_content,status,authorizing_user_id,created_at,__v) VALUES ('rx-a','enc-rx',?,'AUTHORIZED','doctor-a',?,1)", [JSON.stringify(content), new Date().toISOString()]);
  await withTransaction(tx => writePrescriptionItems(tx, { prescriptionId: 'rx-a', prescriptionVersion: 1, medications: content.medications, actorId: 'doctor-a', createdAt: new Date().toISOString() }));
  return { og };
}

async function run() {
  const { og } = await seed();
  const doctor = token('doctor-a','DOCTOR'), otherDoctor = token('doctor-other','DOCTOR');
  const nurse = token('nurse-a','NURSE'), otherNurse = token('nurse-other','NURSE');
  const patient = token('patient-user-a','PATIENT'), patientB = token('patient-user-b','PATIENT'), admin = token('admin-a','ADMIN');
  const today = schedule.dateInZone();
  const currentTime = localTime(new Date());

  const migrationRows = await db.all('SELECT id FROM schema_migrations ORDER BY id');
  assert.equal(migrationRows.length, 15);
  assert.equal(migrationRows.at(-1).id, '015_patient_documents_and_self_records');
  assert.equal(og.name, 'Obstetrics & Gynaecology');
  const readiness = await request(app).get('/api/v1/ready');
  assert.equal(readiness.status, 200, JSON.stringify(readiness.body));
  assert.equal(readiness.body.ready, true);
  assert.equal(readiness.body.migrations_up_to_date, true);
  console.log('PASS 15/15 migration and generated OBST department identity');

  await call(otherDoctor, 'post', '/care-plans/patient-a', { start_date: today }, 404);
  await call(nurse, 'post', '/care-plans/patient-a', { start_date: today }, 403);
  const created = await call(doctor, 'post', '/care-plans/patient-a', { start_date: today, department_id: og.id }, 201);
  const planId = created.care_plan.id;
  let planVersion = created.care_plan.__v;

  const base = { frequency_type: 'DAILY', scheduled_time: currentTime, start_date: today, window_before_minutes: 1440, window_after_minutes: 1440, reminder_enabled: true };
  async function add(task) {
    const response = await call(doctor, 'post', '/care-plans/patient-a/tasks', { __v: planVersion, task: { ...base, ...task } }, 201);
    planVersion = response.care_plan.__v;
    return response.task;
  }
  const glucose = [];
  for (const timing of ['FASTING','BEFORE_DINNER','POST_DINNER']) glucose.push(await add({ task_type: 'MEASUREMENT', title: `${timing}_GLUCOSE`, instruction: 'Record glucose', observation_type: 'GLUCOSE', timing_relation: timing, target_unit: 'mg/dL' }));
  const activity = await add({ task_type: 'ACTIVITY', title: 'Morning Walk', instruction: 'Walk for 30 minutes', expected_duration_minutes: 30 });
  const items = await db.all("SELECT * FROM prescription_items WHERE prescription_id='rx-a' ORDER BY ordinal");
  const medication = await add({ task_type: 'MEDICATION', title: 'ignored', instruction: 'ignored', prescription_item_id: items[0].id });
  const insulin = await add({ task_type: 'INSULIN', title: 'ignored', instruction: 'ignored', prescription_item_id: items[1].id });

  const staleVersion = planVersion;
  const concurrent = await Promise.all([1,2].map(index => request(app).post('/api/v1/opd/care-plans/patient-a/tasks').set(auth(doctor)).send({ __v: staleVersion, task: { ...base, task_type: 'ACTIVITY', title: `Concurrent ${index}`, instruction: 'Synthetic' } })));
  assert.deepEqual(concurrent.map(result => result.status).sort(), [201,409]);
  assert.equal(concurrent.find(result => result.status === 409).body.error.code, 'STALE_STATE');
  planVersion = (await call(doctor, 'get', '/care-plans/patient-a')).plan.__v;
  console.log('PASS Doctor authority and plan-level optimistic locking');

  await call(patientB, 'get', '/care-plans/patient-a', undefined, 404);
  await call(patientB, 'get', '/adherence/patient-a/today', undefined, 404);
  await call(patientB, 'get', '/adherence/patient-a/timeline', undefined, 404);
  await call(otherDoctor, 'get', '/care-plans/patient-a', undefined, 404);
  await call(admin, 'get', '/care-plans/patient-a', undefined, 403);
  assert.ok((await call(nurse, 'get', '/care-plans/patient-a')).plan);
  await call(nurse, 'post', '/care-plans/patient-a/tasks', { __v: planVersion, task: { ...base, task_type: 'ACTIVITY', title: 'Forbidden', instruction: 'Forbidden' } }, 403);
  await call(otherNurse, 'get', '/care-plans/patient-a', undefined, 404);
  console.log('PASS Patient isolation, Doctor linkage, Nurse read-only boundary, and Admin denial');

  const beforeRead = Number((await db.get('SELECT COUNT(*) AS count FROM care_plan_adherence')).count);
  const todayTasks = await call(patient, 'get', '/adherence/patient-a/today');
  assert.ok(todayTasks.length >= 6);
  assert.equal((await call(patient, 'get', '/adherence/patient-user-a/today')).length, todayTasks.length);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM care_plan_adherence')).count), beforeRead);
  await call(patientB, 'post', `/adherence/${glucose[0].id}/record`, { __v: 0, status: 'RECORDED', value: 90, unit: 'mg/dL' }, 404);
  const responseIds = [];
  for (let index = 0; index < glucose.length; index++) {
    const result = await call(patient, 'post', `/adherence/${glucose[index].id}/record`, { __v: 0, status: 'RECORDED', value: 95 + index, unit: 'mg/dL', observed_at: new Date().toISOString(), note: `Synthetic ${glucose[index].timing_relation}` });
    responseIds.push(result.id);
    assert.equal(Number(result.observation.components[0].numeric_value), 95 + index);
  }
  const activityResult = await call(patient, 'post', `/adherence/${activity.id}/record`, { __v: 0, status: 'COMPLETED', note: 'Completed outside' });
  const medicationResult = await call(patient, 'post', `/adherence/${medication.id}/record`, { __v: 0, status: 'TAKEN' });
  const insulinResult = await call(patient, 'post', `/adherence/${insulin.id}/record`, { __v: 0, status: 'TAKEN' });
  responseIds.push(activityResult.id, medicationResult.id, insulinResult.id);
  await call(patient, 'post', `/adherence/${medicationResult.id}/record`, { __v: 1, status: 'TAKEN', value: 999 }, 422);
  const doctorTimeline = await call(doctor, 'get', '/adherence/patient-a/timeline');
  assert.ok(doctorTimeline.some(row => row.task_type === 'MEASUREMENT' && row.observation));
  assert.ok(doctorTimeline.some(row => row.task_type === 'ACTIVITY'));
  assert.ok(doctorTimeline.some(row => row.task_type === 'MEDICATION'));
  assert.ok(doctorTimeline.some(row => row.task_type === 'INSULIN'));
  const nurseTimeline = await call(nurse, 'get', '/adherence/patient-a/timeline');
  assert.deepEqual(nurseTimeline.map(row => row.id).sort(), doctorTimeline.map(row => row.id).sort());
  console.log('PASS glucose, activity, medication and insulin responses with exact persisted timeline data');

  await call(doctor, 'patch', `/care-plans/tasks/${activity.id}`, { __v: planVersion, action: 'REPLACE', expected_revision: 1, effective_date: today, reason: 'Unsafe same day', task: { ...base, task_type: 'ACTIVITY', title: 'Changed Walk', instruction: 'Different instruction' } }, 409);
  const tomorrow = schedule.addDays(today, 1);
  const replaced = await call(doctor, 'patch', `/care-plans/tasks/${activity.id}`, { __v: planVersion, action: 'REPLACE', expected_revision: 1, effective_date: tomorrow, reason: 'Prospective change', task: { ...base, start_date: tomorrow, task_type: 'ACTIVITY', title: 'Evening Walk', instruction: 'Walk for 20 minutes', expected_duration_minutes: 20 } });
  planVersion = replaced.care_plan.__v;
  assert.equal(replaced.task.revision, 2);
  assert.equal((await db.get('SELECT task_id FROM care_plan_adherence WHERE id=?', [activityResult.id])).task_id, activity.id);
  const deactivationCandidate = await add({ task_type: 'ACTIVITY', title: 'Short Exercise', instruction: 'Stretch' });
  const deactivated = await call(doctor, 'patch', `/care-plans/tasks/${deactivationCandidate.id}`, { __v: planVersion, action: 'DEACTIVATE', expected_revision: 1, effective_date: tomorrow, reason: 'No longer prescribed' });
  planVersion = deactivated.care_plan.__v;
  assert.equal(deactivated.prior_task.status, 'INACTIVE');
  console.log('PASS same-day conflict, prospective immutable task replacement, and task deactivation');

  const amendedContent = { medications: [{ ...JSON.parse((await db.get("SELECT rx_content FROM prescriptions WHERE id='rx-a'")).rx_content).medications[0], dose: '2 tablets' }, JSON.parse((await db.get("SELECT rx_content FROM prescriptions WHERE id='rx-a'")).rx_content).medications[1]], validation: { signed_by: 'doctor-a' } };
  await withTransaction(async tx => {
    const changed = await tx.run("UPDATE prescriptions SET rx_content=?,__v=2 WHERE id='rx-a' AND __v=1", [JSON.stringify(amendedContent)]);
    assert.equal(changed.changes, 1);
    await writePrescriptionItems(tx, { prescriptionId: 'rx-a', prescriptionVersion: 2, medications: amendedContent.medications, actorId: 'doctor-a', createdAt: new Date().toISOString() });
  });
  const model = await call(doctor, 'get', '/care-plans/patient-a');
  assert.equal(model.tasks.find(task => task.id === medication.id).medication_source_outdated, true);
  assert.equal(model.tasks.find(task => task.id === medication.id).dose, '1 tablet');
  const beforeRollback = (await db.get("SELECT rx_content FROM prescriptions WHERE id='rx-a'")).rx_content;
  await assert.rejects(() => withTransaction(async tx => {
    await tx.run("UPDATE prescriptions SET rx_content=?,__v=3 WHERE id='rx-a' AND __v=2", ['{"invalid":true}']);
    await writePrescriptionItems(tx, { prescriptionId: 'rx-a', prescriptionVersion: 3, medications: [{ drug_id: 'missing-drug', dose: '1', frequency: '1', duration: '1', instructions: '' }], actorId: 'doctor-a', createdAt: new Date().toISOString() });
  }));
  assert.equal((await db.get("SELECT __v FROM prescriptions WHERE id='rx-a'")).__v, 2);
  assert.equal((await db.get("SELECT rx_content FROM prescriptions WHERE id='rx-a'")).rx_content, beforeRollback);
  await call(doctor, 'post', '/care-plans/patient-a/tasks', { __v: planVersion, task: { ...base, task_type: 'MEDICATION', title: 'ignored', instruction: 'ignored', prescription_item_id: items[0].id } }, 409);
  const currentItems = await db.all("SELECT * FROM prescription_items WHERE prescription_id='rx-a' AND prescription_version=2 ORDER BY ordinal");
  console.log('PASS immutable medication source, synchronized amendment, and transactional rollback');

  const reminderAt = new Date();
  const reminderDue = plusMinutes(reminderAt, 60);
  const reminderDate = schedule.dateInZone(reminderDue);
  const reminderTime = localTime(reminderDue);
  for (const [kind, extra] of [
    ['MEASUREMENT',{ title:'Glucose reminder',instruction:'Record glucose',observation_type:'GLUCOSE',timing_relation:'RANDOM',target_unit:'mg/dL' }],
    ['ACTIVITY',{ title:'Activity reminder',instruction:'Walk' }],
    ['MEDICATION',{ title:'ignored',instruction:'ignored',prescription_item_id:currentItems[0].id }],
    ['INSULIN',{ title:'ignored',instruction:'ignored',prescription_item_id:currentItems[1].id }]
  ]) {
    const added = await call(doctor, 'post', '/care-plans/patient-a/tasks', { __v: planVersion, task: { ...base, ...extra, task_type: kind, start_date: reminderDate, scheduled_time: reminderTime } }, 201);
    planVersion = added.care_plan.__v;
  }
  const notificationStats = await runNotificationCycle({ at: reminderAt });
  assert.equal(notificationStats.deliveryEnabled, false);
  const reminderRows = await db.all("SELECT context FROM opd_notifications WHERE code='CARE_TASK_REMINDER'");
  const reminderTypes = new Set(reminderRows.map(row => JSON.parse(row.context).task_type));
  for (const type of ['MEASUREMENT','ACTIVITY','MEDICATION','INSULIN']) assert.ok(reminderTypes.has(type), `missing ${type} reminder`);
  const reminderCount = reminderRows.length;
  assert.ok(reminderCount >= 4);
  await runNotificationCycle({ at: reminderAt });
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM opd_notifications WHERE code='CARE_TASK_REMINDER'")).count), reminderCount);
  console.log('PASS persisted deduped glucose/activity/medication/insulin reminder generation');

  const boundaryTask = { scheduled_time: '07:30', window_before_minutes: 15, window_after_minutes: 30 };
  const due = new Date(schedule.scheduledFor('2030-01-15','07:30'));
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', null, plusMinutes(due,-16)), 'UPCOMING');
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', null, plusMinutes(due,-15)), 'DUE');
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', null, plusMinutes(due,30)), 'DUE');
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', null, plusMinutes(due,31)), 'MISSED');
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', {status:'SKIPPED'}, due), 'SKIPPED');
  assert.equal(schedule.derivedStatus(boundaryTask, '2030-01-15', {status:'COMPLETED'}, due), 'COMPLETED');
  console.log('PASS deterministic Asia/Kolkata occurrence boundaries and all checklist states');

  await db.run("UPDATE queue_entries SET status='COMPLETED' WHERE encounter_id='enc-active'");
  await call(nurse, 'get', '/care-plans/patient-a', undefined, 404);
  const deactivatedPlan = await call(doctor, 'patch', '/care-plans/patient-a', { __v: planVersion, status: 'INACTIVE', effective_date: tomorrow, reason: 'Synthetic pilot completion' });
  assert.equal(deactivatedPlan.care_plan.status, 'INACTIVE');
  const audit = await db.all("SELECT actor_id,patient_id,action,correlation_id,new_state FROM audit_logs WHERE action LIKE 'CARE_PLAN%' ORDER BY id");
  assert.ok(audit.some(row => row.action === 'CARE_PLAN_TASK_REPLACED' && row.actor_id === 'doctor-a' && row.correlation_id));
  const ids = {
    patient_id: 'patient-a', care_plan_id: planId,
    task_series_id: activity.series_id, task_revision: replaced.task.revision,
    occurrence_response_id: activityResult.id,
    observation_id: doctorTimeline.find(row => row.observation)?.observation.id,
    prescription_id: 'rx-a', prescription_item_id: items[0].id
  };
  console.log('SAME_POSTGRESQL_PROOF ' + JSON.stringify(ids));
  console.log(`PASS ${responseIds.length} persisted responses share the same patient, task revisions, prescription items and database workflow`);
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
