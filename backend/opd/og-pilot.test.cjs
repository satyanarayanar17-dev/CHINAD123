const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
if (process.env.OPD_TEST_POSTGRES !== 'true') throw Error('Run through scripts/isolated-postgres.cjs');
Object.assign(process.env, {
  NODE_ENV: 'test', APP_ENV: 'restricted_web_pilot', ENABLE_LEGACY_API: 'false',
  JWT_SECRET: 'A9z!K7m#Q4v@R2x$A9z!K7m#Q4v@R2x$', CORS_ORIGIN: 'https://pilot.example.invalid',
  COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'none', SMS_WEBHOOK_URL: 'https://sms.example.invalid/send',
  SMS_WEBHOOK_TOKEN: 'synthetic-adapter-credential', OPD_PILOT_DEPARTMENT_PREFIX: 'OBST'
});
const app = require('../server');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const { dateInZone } = require('../lib/carePlanSchedule');
const auth = token => ({ Authorization: `Bearer ${token}` });
async function session(id, role) {
  const sid = `sid-${id}`;
  await db.run('INSERT INTO refresh_tokens (id,user_id,expires_at,revoked,account_type,session_key) VALUES (?,?,?,?,?,?)', [`hash-${id}`, id, new Date(Date.now()+3600000).toISOString(), 0, role === 'PATIENT' ? 'PATIENT' : 'STAFF', sid]);
  return jwt.sign({ id, role, account_type: role === 'PATIENT' ? 'PATIENT' : 'STAFF', sid }, JWT_SECRET, { expiresIn: '1h' });
}
async function call(token, method, url, body, status=200) {
  const response = await request(app)[method]('/api/v1/opd'+url).set(auth(token)).send(body);
  assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);
  return response.body;
}
(async()=>{
  await db.migrateDatabase();
  const og=await db.get("SELECT * FROM departments WHERE prefix='OBST'");
  await db.run("INSERT INTO departments (id,name,prefix) VALUES ('gm-dept','General Medicine','GM')");
  for(const [id,name] of [['pilot-p','Pilot Patient'],['gm-p','GM Patient']])await db.run('INSERT INTO patients (id,mrn,name,phone,dob,gender) VALUES (?,?,?,?,?,?)',[id,'MRN-'+id,name,id==='pilot-p'?'+919200000001':'+919200000002','1990-01-01','Female']);
  for(const row of [['pilot-admin','ADMIN','Pilot Admin',og.name,null],['pilot-doc','DOCTOR','Pilot Doctor',og.name,null],['gm-doc','DOCTOR','GM Doctor','General Medicine',null],['pilot-nurse','NURSE','Pilot Nurse',og.name,null],['pilot-p-user','PATIENT','Pilot Patient',null,'pilot-p']])await db.run('INSERT INTO users (id,role,name,department,patient_id,is_active,must_change_password) VALUES (?,?,?,?,?,1,0)',row);
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged,assigned_doctor_id,created_at) VALUES ('pilot-enc','pilot-p','RECEPTION','RECEPTION',0,'pilot-doc',CURRENT_TIMESTAMP)");
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged,assigned_doctor_id,created_at) VALUES ('gm-enc','gm-p','RECEPTION','RECEPTION',0,'gm-doc',CURRENT_TIMESTAMP)");
  for(const [id,p,d,dept,enc] of [['pilot-apt','pilot-p','pilot-doc',og.id,'pilot-enc'],['gm-apt','gm-p','gm-doc','gm-dept','gm-enc']]){
    await db.run('INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,encounter_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,\'CHECKED_IN\',?,?,?,CURRENT_TIMESTAMP)',[id,p,d,dept,new Date().toISOString(),new Date(Date.now()+900000).toISOString(),'Room','Pilot filter',enc,'pilot-admin']);
    await db.run("INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES (?,?,?,?,?,'WAITING',CURRENT_TIMESTAMP,'pilot-admin',1)",[enc,id,dept,dept===og.id?'OBST-001':'GM-001',dateInZone()]);
  }
  await db.run("INSERT INTO practitioner_schedules (id,doctor_id,department_id,weekday,start_time,end_time,slot_minutes,room) VALUES ('pilot-s','pilot-doc',?,1,'09:00','12:00',15,'OG 1')",[og.id]);
  await db.run("INSERT INTO practitioner_schedules (id,doctor_id,department_id,weekday,start_time,end_time,slot_minutes,room) VALUES ('gm-s','gm-doc','gm-dept',1,'09:00','12:00',15,'GM 1')");
  const admin=await session('pilot-admin','ADMIN'), pilotDoctor=await session('pilot-doc','DOCTOR'), gmDoctor=await session('gm-doc','DOCTOR');
  const directory=await call(admin,'get','/directory');assert.deepEqual(directory.departments.map(d=>d.prefix),['OBST']);assert.deepEqual(directory.doctors.map(d=>d.id),['pilot-doc']);
  assert.ok((await call(admin,'get','/appointments')).every(row=>row.department_id===og.id));
  assert.ok((await call(admin,'get','/queue')).every(row=>row.department_id===og.id));
  assert.deepEqual((await call(admin,'get','/dashboard')).departments.map(row=>row.name),[og.name]);
  await call(admin,'post','/staff',{id:'bad-staff',name:'Bad Staff',role:'DOCTOR',department:'General Medicine',password:'InitialPass2026!'},422);
  await call(admin,'post','/schedules',{doctor_id:'gm-doc',department_id:'gm-dept',weekday:2,start_time:'09:00',end_time:'12:00',slot_minutes:15,room:'GM 2',break_start:null,break_end:null},422);
  await call(admin,'post','/catalogues/departments',{name:'Cardiology',prefix:'CARD'},422);
  await call(gmDoctor,'post','/care-plans/gm-p',{start_date:dateInZone(),department_id:'gm-dept'},422);
  await call(pilotDoctor,'post','/care-plans/pilot-p',{start_date:dateInZone(),department_id:og.id},201);
  console.log('PASS restricted pilot resolves generated OBST identity and filters directory/staff/schedules/appointments/queue/dashboard/catalogues/care-plans');
  await db.pgPool.end();
})().catch(async error=>{console.error(error);if(db.pgPool)await db.pgPool.end();process.exit(1)});
