// Isolated authentication regression; never opens the saved demo database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'restricted_web_pilot') throw Error('Local tests only');
Object.assign(process.env, {
  NODE_ENV: 'development', APP_ENV: 'local_dev', DB_DIALECT: 'sqlite',
  SQLITE_PATH: path.join(mkdtempSync(path.join(tmpdir(), 'cc-auth-session-')), 'test.db'),
  ENABLE_LEGACY_API: 'false', BOOTSTRAP_ADMIN_ID: 'auth_qa_admin',
  BOOTSTRAP_ADMIN_NAME: 'Synthetic Authentication QA Admin', BOOTSTRAP_ADMIN_PASSWORD: 'SyntheticAuth2026!',
});
const request = require('supertest');
const app = require('../server');
const db = require('../database');
const { ensureBootstrapAdmin } = require('../bootstrapAdmin');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, createSessionCredentials } = require('../middleware/auth');

test('failed server revocation reports failure, preserves retry credential, and successful retry invalidates access', async () => {
  await db.migrateDatabase(); await ensureBootstrapAdmin(db);
  const login = await request(app).post('/api/v1/auth/login/staff').send({ username: 'auth_qa_admin', password: 'SyntheticAuth2026!' });
  assert.equal(login.status, 200);
  const token = login.body.access_token;
  const cookie = login.headers['set-cookie'].find(value => value.startsWith('cc_refresh_token=')).split(';')[0];
  const authorized = () => request(app).get('/api/v1/opd/session').set('Authorization', `Bearer ${token}`);
  await db.run("CREATE TRIGGER test_reject_logout BEFORE UPDATE OF revoked ON refresh_tokens WHEN NEW.revoked=1 BEGIN SELECT RAISE(ABORT,'synthetic revocation failure'); END");
  try {
    const failed = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).send({});
    assert.equal(failed.status, 503, 'A failed revocation must not be reported as successful logout.');
    assert.equal(failed.body.error.code, 'LOGOUT_FAILED');
    assert.equal(failed.headers['set-cookie'], undefined, 'Retain the HttpOnly credential so logout can be retried.');
    assert.equal((await authorized()).status, 200);
  } finally {
    await db.run('DROP TRIGGER test_reject_logout');
  }
  const retried = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).send({});
  assert.equal(retried.status, 200);
  assert.ok(retried.headers['set-cookie'].some(value => value.startsWith('cc_refresh_token=;')));
  assert.equal((await authorized()).status, 401);
  const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).send({});
  assert.equal(refresh.status, 401);
});

test('cancelled or no-show booking alone does not authorize a doctor to read a patient record', async () => {
  // These are synthetic access-control fixtures, not clinical workflow setup.
  await db.migrateDatabase();
  await db.run("INSERT INTO patients (id,name,phone,dob,gender,mrn) VALUES ('rbac-patient','Synthetic RBAC Patient','+919000000078','1988-01-15','Female','QA-RBAC-078')");
  await db.run("INSERT INTO users (id,name,role,is_active,must_change_password) VALUES ('rbac-doctor','Synthetic RBAC Doctor','DOCTOR',1,0)");
  await db.run("INSERT INTO departments (id,name,prefix) VALUES ('rbac-department','Synthetic RBAC Department','QARBAC')");
  await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at) VALUES ('rbac-appointment','rbac-patient','rbac-doctor','rbac-department','2030-01-01T09:00:00.000Z','2030-01-01T09:15:00.000Z','QA','CANCELLED','Synthetic cancelled booking','rbac-doctor','2030-01-01T08:00:00.000Z')");
  const credentials = createSessionCredentials();
  await db.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?, ?,0,'STAFF')", [credentials.tokenHash, credentials.sessionKey, 'rbac-doctor', new Date(Date.now()+600000).toISOString()]);
  const token = jwt.sign({ id: 'rbac-doctor', role: 'DOCTOR', account_type: 'STAFF', sid: credentials.sessionKey }, JWT_SECRET, { expiresIn: '10m' });
  const record = () => request(app).get('/api/v1/opd/patients/rbac-patient/record').set('Authorization', `Bearer ${token}`);
  assert.equal((await record()).status, 404, 'Cancelled booking must not authorize clinical reads.');
  await db.run("UPDATE appointments SET status='NO_SHOW' WHERE id='rbac-appointment'");
  assert.equal((await record()).status, 404, 'No-show booking must not authorize clinical reads.');
  await db.run("UPDATE appointments SET status='CONFIRMED' WHERE id='rbac-appointment'");
  assert.equal((await record()).status, 200, 'Confirmed assigned appointment permits preparation.');
  await db.run("UPDATE appointments SET status='CANCELLED' WHERE id='rbac-appointment'");
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,assigned_doctor_id,is_discharged) VALUES ('rbac-encounter','rbac-patient','DISCHARGED','DISCHARGED','rbac-doctor',1)");
  assert.equal((await record()).status, 200, 'Historical assigned encounter retains legitimate follow-up access.');
});

test('nurse denies real patient and encounter IDs belonging to another department', async () => {
  await db.run("INSERT INTO departments (id,name,prefix) VALUES ('nurse-own-department','Synthetic Nurse Department','QANUR')");
  await db.run("INSERT INTO users (id,name,role,department,is_active,must_change_password) VALUES ('rbac-nurse','Synthetic RBAC Nurse','NURSE','Synthetic Nurse Department',1,0)");
  for (const [suffix, department] of [['own', 'nurse-own-department'], ['other', 'rbac-department']]) {
    await db.run('INSERT INTO patients (id,name,dob,gender,mrn) VALUES (?,?,?,?,?)', [`nurse-patient-${suffix}`, `Synthetic Nurse ${suffix}`, '1988-01-15', 'Female', `QA-NURSE-${suffix}`]);
    await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,assigned_doctor_id,is_discharged) VALUES (?,?,'RECEPTION','RECEPTION','rbac-doctor',0)", [`nurse-encounter-${suffix}`, `nurse-patient-${suffix}`]);
    await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at,encounter_id) VALUES (?,?,'rbac-doctor',?,'2030-01-02T09:00:00.000Z','2030-01-02T09:15:00.000Z','QA','CHECKED_IN','Synthetic RBAC fixture','rbac-doctor','2030-01-02T08:00:00.000Z',?)", [`nurse-appointment-${suffix}`, `nurse-patient-${suffix}`, department, `nurse-encounter-${suffix}`]);
    // Distinct scheduled_at avoids the independent provider-slot uniqueness guard.
    if (suffix === 'own') await db.run("UPDATE appointments SET scheduled_at='2030-01-02T08:00:00.000Z',ends_at='2030-01-02T08:15:00.000Z' WHERE id='nurse-appointment-own'");
    await db.run("INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES (?,?,?,?,'2030-01-02','WAITING','2030-01-02T08:00:00.000Z','rbac-doctor',1)", [`nurse-encounter-${suffix}`, `nurse-appointment-${suffix}`, department, `QA-${suffix}`]);
  }
  const credentials = createSessionCredentials();
  await db.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?, ?,0,'STAFF')", [credentials.tokenHash, credentials.sessionKey, 'rbac-nurse', new Date(Date.now()+600000).toISOString()]);
  const token = jwt.sign({ id: 'rbac-nurse', role: 'NURSE', account_type: 'STAFF', sid: credentials.sessionKey }, JWT_SECRET, { expiresIn: '10m' });
  const authorization = `Bearer ${token}`;
  const own = await request(app).get('/api/v1/opd/patients/nurse-patient-own/record').set('Authorization', authorization);
  assert.equal(own.status, 200);
  const other = await request(app).get('/api/v1/opd/patients/nurse-patient-other/record').set('Authorization', authorization);
  assert.equal(other.status, 404);
  const triage = await request(app).post('/api/v1/opd/encounters/nurse-encounter-other/start-triage').set('Authorization', authorization).send({ __v: 1 });
  assert.equal(triage.status, 404);
  const clinical = await request(app).post('/api/v1/opd/encounters/nurse-encounter-own/complete').set('Authorization', authorization).send({});
  assert.equal(clinical.status, 403);
  const queue = await request(app).get('/api/v1/opd/queue').set('Authorization', authorization);
  assert.equal(queue.status, 200); assert.deepEqual(queue.body.map(row => row.patient_id), ['nurse-patient-own']);
});
