const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-patient-portal-'));
if (process.env.OPD_TEST_POSTGRES === 'true' && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB || '') || new URL(process.env.DATABASE_URL).pathname !== '/' + process.env.CC_ISOLATED_TEST_DB)) throw Error('PostgreSQL acceptance requires scripts/isolated-postgres.cjs');
if (process.env.OPD_TEST_POSTGRES !== 'true') Object.assign(process.env, { DB_DIALECT: 'sqlite', SQLITE_PATH: path.join(root, 'test.db') });
Object.assign(process.env, { NODE_ENV: 'test', APP_ENV: 'local_dev', PATIENT_DOCUMENT_STORAGE_PATH: path.join(root, 'documents'), ENABLE_LEGACY_API: 'true', OPD_NOTIFICATION_WORKER: 'false', OPD_OG_PILOT_ONLY: 'true' });
const app = require('../server');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const auth = value => ({ Authorization: `Bearer ${value}` });
const token = (id, role) => jwt.sign({ id, role, account_type: role === 'PATIENT' ? 'PATIENT' : 'STAFF' }, JWT_SECRET, { expiresIn: '1h' });

async function run() {
  await db.migrateDatabase();
  const og = await db.get("SELECT * FROM departments WHERE prefix='OBST'");
  for (const patient of [['patient-a','MRN-A','Patient A','+919100000001'],['patient-b','MRN-B','Patient B','+919100000002']]) await db.run('INSERT INTO patients (id,mrn,name,phone,dob,gender) VALUES (?,?,?,?,?,?)', [...patient, '1990-01-01', 'Female']);
  for (const user of [['patient-user-a','PATIENT','Patient A',null,'patient-a'],['patient-user-b','PATIENT','Patient B',null,'patient-b'],['doctor-a','DOCTOR','Doctor A',og.name,null],['nurse-a','NURSE','Nurse A',og.name,null],['admin-a','ADMIN','Admin A',og.name,null]]) await db.run('INSERT INTO users (id,role,name,department,patient_id,is_active,must_change_password) VALUES (?,?,?,?,?,1,0)', user);
  const now = new Date().toISOString(), later = new Date(Date.now() + 1800000).toISOString();
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged,assigned_doctor_id,created_at) VALUES ('enc-a','patient-a','RECEPTION','RECEPTION',0,'doctor-a',?)", [now]);
  await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,encounter_id,created_by,created_at) VALUES ('apt-a','patient-a','doctor-a',?,?,?,'OG 1','CHECKED_IN','Review','enc-a','admin-a',?)", [og.id, now, later, now]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  await db.run("INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES ('enc-a','apt-a',?,'OBST-001',?,'WAITING',?,'admin-a',1)", [og.id, today, now]);
  const patient = token('patient-user-a','PATIENT'), other = token('patient-user-b','PATIENT'), doctor = token('doctor-a','DOCTOR'), nurse = token('nurse-a','NURSE'), admin = token('admin-a','ADMIN');

  const base = '/api/v1/opd/patient-self-records/patient-a';
  const glucose = await request(app).post(base).set(auth(patient)).send({ record_type:'GLUCOSE', timing_context:'AFTER_BREAKFAST', numeric_value:112, unit:'mg/dL', observed_at:now, patient_note:'Home meter' });
  assert.equal(glucose.status, 201, JSON.stringify(glucose.body)); assert.equal(glucose.body.provenance, 'PATIENT_SELF_RECORDED');
  const bp = await request(app).post(base).set(auth(patient)).send({ record_type:'BLOOD_PRESSURE', numeric_value:118, secondary_numeric_value:76, unit:'mmHg', observed_at:now }); assert.equal(bp.status,201,JSON.stringify(bp.body));
  const activity = await request(app).post(base).set(auth(patient)).send({ record_type:'ACTIVITY', activity_name:'Walk', duration_minutes:30, observed_at:now }); assert.equal(activity.status,201,JSON.stringify(activity.body));
  assert.equal((await request(app).post(base).set(auth(patient)).send({ record_type:'GLUCOSE', numeric_value:1, unit:'mg/dL', observed_at:now })).status,422);
  assert.equal((await request(app).post(base).set(auth(doctor)).send({ record_type:'WEIGHT', numeric_value:60, unit:'kg', observed_at:now })).status,403);
  assert.equal((await request(app).get(base).set(auth(other))).status,404);
  assert.equal((await request(app).get(base).set(auth(admin))).status,403);
  assert.equal((await request(app).get(base).set(auth(doctor))).body.length,3);
  assert.equal((await request(app).get(base).set(auth(nurse))).body.length,3);

  const pdf = Buffer.from('%PDF-1.4\n% synthetic private patient report\n%%EOF');
  const uploaded = await request(app).post('/api/v1/opd/patient-documents/patient-a').set(auth(patient)).field('document_type','LAB_REPORT').field('title','CBC report').field('clinical_date','2026-09-20').field('appointment_id','apt-a').field('patient_note','Previous result').attach('file',pdf,{filename:'report.pdf',contentType:'application/pdf'});
  assert.equal(uploaded.status,201,JSON.stringify(uploaded.body)); assert.equal(uploaded.body.storage_key,undefined); assert.equal(uploaded.body.appointment_id,'apt-a');
  const documentId = uploaded.body.id;
  const listed = await request(app).get('/api/v1/opd/patient-documents/patient-a').set(auth(doctor)); assert.equal(listed.status,200); assert.equal(listed.body.length,1); assert.equal(listed.body[0].storage_key,undefined);
  const detached = await request(app).patch(`/api/v1/opd/patient-documents/patient-a/${documentId}/appointment`).set(auth(patient)).send({appointment_id:null}); assert.equal(detached.status,200); assert.equal(detached.body.appointment_id,null);
  const attached = await request(app).patch(`/api/v1/opd/patient-documents/patient-a/${documentId}/appointment`).set(auth(patient)).send({appointment_id:'apt-a'}); assert.equal(attached.status,200); assert.equal(attached.body.appointment_id,'apt-a');
  assert.equal((await request(app).patch(`/api/v1/opd/patient-documents/patient-a/${documentId}/appointment`).set(auth(doctor)).send({appointment_id:null})).status,403);
  assert.equal((await request(app).patch(`/api/v1/opd/patient-documents/patient-a/${documentId}/appointment`).set(auth(admin)).send({appointment_id:null})).status,403);
  const content = await request(app).get(`/api/v1/opd/patient-documents/patient-a/${documentId}/content`).set(auth(nurse)); assert.equal(content.status,200); assert.equal(content.headers['content-type'],'application/pdf');
  assert.equal((await request(app).get('/api/v1/opd/patient-documents/patient-a').set(auth(other))).status,404);
  assert.equal((await request(app).get('/api/v1/opd/patient-documents/patient-a').set(auth(admin))).status,403);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM patient_documents WHERE patient_id=? AND appointment_id=?',['patient-a','apt-a'])).count),1);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM patient_self_records WHERE patient_id=? AND provenance='PATIENT_SELF_RECORDED'",['patient-a'])).count),3);
  console.log('PASS patient self-records and private document upload/list/content use the same patient, appointment and PostgreSQL-compatible schema rows');
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
