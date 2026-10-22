const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-cross-client-'));
const pg=process.env.OPD_TEST_POSTGRES==='true';
if(pg && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB||'') || new URL(process.env.DATABASE_URL).pathname!=='/'+process.env.CC_ISOLATED_TEST_DB))throw Error('Requires isolated-postgres.cjs');
Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'local_dev',OPD_DEMO_OTP:'true',ENABLE_LEGACY_API:'false',OPD_NOTIFICATION_WORKER:'false',OPD_OG_PILOT_ONLY:'false',JWT_SECRET:'SyntheticCrossClientRegression2026Only',...(!pg?{DB_DIALECT:'sqlite',SQLITE_PATH:path.join(root,'fixture.db')}:{})});
const request=require('supertest'),jwt=require('jsonwebtoken');
const app=require('../server'),db=require('../database');
const {createSessionCredentials}=require('../middleware/auth');
const tokens={};let department;
const call=(who,id,action,body)=>request(app).post('/api/v1/opd/appointments/'+id+'/'+action).set('Authorization','Bearer '+tokens[who]).send(body);
before(async()=>{
 await db.migrateDatabase();department=await db.get("SELECT * FROM departments WHERE prefix='OBST'");
 await db.run("INSERT INTO patients (id,mrn,name,phone,dob,gender) VALUES ('audit-patient','AUDIT-001','Synthetic audit patient','+919000009001','1990-01-01','Female')");
 for(const id of ['owner','unassigned']){
  await db.run("INSERT INTO users (id,name,role,department,is_active,must_change_password) VALUES (?,?,'DOCTOR',?,1,0)",[id,'Synthetic '+id,department.name]);
  const c=createSessionCredentials();
  await db.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?,?,0,'STAFF')",[c.tokenHash,c.sessionKey,id,new Date(Date.now()+3600000).toISOString()]);
  tokens[id]=jwt.sign({id,role:'DOCTOR',account_type:'STAFF',sid:c.sessionKey},process.env.JWT_SECRET,{expiresIn:'1h'});
 }
});
after(async()=>{if(db.pgPool)await db.pgPool.end();else await new Promise(r=>db.db.close(r));fs.rmSync(root,{recursive:true,force:true});});
async function appointment(id,status='PENDING_CONFIRMATION'){
 const at=new Date().toISOString();
 await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at,__v) VALUES (?,'audit-patient','owner',?,?,?,'Synthetic room',?,'Synthetic visit','owner',?,2)",[id,department.id,at,new Date(Date.now()+900000).toISOString(),status,at]);
}
test('idempotent confirmation cannot disclose another doctor’s confirmed patient',async()=>{
 await appointment('private-confirmed','CONFIRMED');
 const r=await call('unassigned','private-confirmed','confirm',{});
 assert.equal(r.status,403);assert.equal(r.body.patient_name,undefined);
});
test('a reviewed appointment revision is checked before confirmation',async()=>{
 await appointment('stale-confirm');
 const r=await call('owner','stale-confirm','confirm',{__v:1});assert.equal(r.status,409);
 assert.equal((await db.get("SELECT status FROM appointments WHERE id='stale-confirm'")).status,'PENDING_CONFIRMATION');
 assert.equal((await call('owner','stale-confirm','confirm',{__v:2})).status,200);
});
test('a reviewed appointment revision is checked before creating an encounter',async()=>{
 await appointment('stale-checkin','CONFIRMED');
 const r=await call('owner','stale-checkin','check-in',{__v:1,identity_verified:true});assert.equal(r.status,409);
 assert.equal((await db.get("SELECT encounter_id FROM appointments WHERE id='stale-checkin'")).encounter_id,null);
 assert.equal((await call('owner','stale-checkin','check-in',{__v:2,identity_verified:true})).status,200);
});
test('malformed supplied revisions are rejected instead of ignored',async()=>{
 await appointment('malformed');
 for(const v of [0,'2',-1])assert.equal((await call('owner','malformed','confirm',{__v:v})).status,422);
});
test('older clients remain compatible but never bypass ownership checks',async()=>{
 await appointment('legacy');
 assert.equal((await call('unassigned','legacy','confirm',{})).status,403);
 assert.equal((await call('owner','legacy','confirm',{})).status,200);
 assert.equal((await request(app).post('/api/v1/opd/appointments/legacy/confirm').set('Authorization','Bearer '+tokens.owner)).status,200);
});

test('PostgreSQL and SQLite return native JSON numbers for measurements and care-plan observations',async()=>{
 await db.run("INSERT INTO users (id,name,role,patient_id,is_active,must_change_password) VALUES ('measurement-patient','Synthetic patient','PATIENT','audit-patient',1,0)");
 const credentials=createSessionCredentials();
 await db.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?, ?,0,'PATIENT')",[credentials.tokenHash,credentials.sessionKey,'measurement-patient',new Date(Date.now()+3600000).toISOString()]);
 const patient=jwt.sign({id:'measurement-patient',role:'PATIENT',account_type:'PATIENT',sid:credentials.sessionKey},process.env.JWT_SECRET,{expiresIn:'1h'});
 const api=(token,method,url,body)=>request(app)[method]('/api/v1/opd'+url).set('Authorization','Bearer '+token).send(body);
 const record=await api(patient,'post','/patient-self-records/audit-patient',{record_type:'BLOOD_PRESSURE',numeric_value:118.5,secondary_numeric_value:76.5,unit:'mmHg',observed_at:new Date().toISOString()});
 assert.equal(record.status,201,JSON.stringify(record.body));assert.equal(record.body.numeric_value,118.5);assert.equal(record.body.secondary_numeric_value,76.5);
 const records=await api(patient,'get','/patient-self-records/audit-patient');assert.equal(records.body[0].numeric_value,118.5);assert.equal(records.body[0].secondary_numeric_value,76.5);
 const date=require('../lib/carePlanSchedule').dateInZone();
 const plan=await api(tokens.owner,'post','/care-plans/audit-patient',{start_date:date});assert.equal(plan.status,201,JSON.stringify(plan.body));
 const task=await api(tokens.owner,'post','/care-plans/audit-patient/tasks',{__v:plan.body.care_plan.__v,task:{task_type:'MEASUREMENT',title:'Synthetic glucose',instruction:'Synthetic observation',frequency_type:'DAILY',scheduled_time:'10:00',start_date:date,window_before_minutes:1440,window_after_minutes:1440,observation_type:'GLUCOSE',timing_relation:'FASTING',target_unit:'mg/dL'}});
 assert.equal(task.status,201,JSON.stringify(task.body));
 const recorded=await api(patient,'post','/adherence/'+task.body.task.id+'/record',{__v:0,status:'RECORDED',value:112.5,unit:'mg/dL'});
 assert.equal(recorded.status,200,JSON.stringify(recorded.body));assert.equal(recorded.body.recorded_value,112.5);assert.equal(recorded.body.observation.components[0].numeric_value,112.5);
 const today=await api(patient,'get','/adherence/audit-patient/today');assert.equal(today.body[0].recorded_value,112.5);
 const history=await api(patient,'get','/adherence/audit-patient/timeline');assert.equal(history.body[0].observation.components[0].numeric_value,112.5);
});
