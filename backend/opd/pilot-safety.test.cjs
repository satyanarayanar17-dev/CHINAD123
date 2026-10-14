const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pilot-safety-'));
Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'local_dev',DB_DIALECT:'sqlite',SQLITE_PATH:path.join(root,'fixture.db'),PATIENT_DOCUMENT_STORAGE_PATH:path.join(root,'documents'),OPD_DEMO_OTP:'true',ENABLE_LEGACY_API:'false',OPD_NOTIFICATION_WORKER:'false',OPD_OG_PILOT_ONLY:'false',CLINICAL_RULES_APPROVED:'false',JWT_SECRET:'SyntheticPilotSafetySecret2026Only'});
const request = require('supertest'), jwt = require('jsonwebtoken');
const app = require('../server'), db = require('../database');
const { createSessionCredentials } = require('../middleware/auth');
const tokens = {};
const call = (role,method,url,body,headers={}) => request(app)[method]('/api/v1/opd'+url).set({Authorization:'Bearer '+tokens[role],...headers}).send(body);
const vitals = {temperature:37,systolic:120,diastolic:80,pulse:80,spo2:99,weight:60,height:160,pain:0,priority:0,complaint:'Synthetic complaint'};
before(async()=>{
 await db.migrateDatabase();
 const department=await db.get("SELECT * FROM departments WHERE prefix='OBST'");
 await db.run("INSERT INTO departments (id,name,prefix) VALUES ('safe-other','Synthetic other department','SAFE')");
 for(const [id,phone] of [['safe-p','+919000001991'],['safe-other-p','+919000001992']]) await db.run('INSERT INTO patients (id,mrn,name,phone,dob,gender,address,city,state,pin_code,emergency_contact,allergies,allergy_review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,'SYN-'+id,'Synthetic Safety Patient',phone,'1995-01-01','Female','Synthetic Address','Test City','Test State','600001','+919000001999','Synthetic existing allergy','RECORDED']);
 for(const [id,role,patient] of [['safe-p-user','PATIENT','safe-p'],['safe-admin','ADMIN',null],['safe-doctor','DOCTOR',null],['safe-nurse','NURSE',null]]){
  await db.run('INSERT INTO users (id,name,role,department,patient_id,is_active,must_change_password) VALUES (?,?,?,?,?,1,0)',[id,'Synthetic '+role,role,department.name,patient]);
  const c=createSessionCredentials();
  await db.run('INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?,?,0,?)',[c.tokenHash,c.sessionKey,id,new Date(Date.now()+3600000).toISOString(),role==='PATIENT'?'PATIENT':'STAFF']);
  tokens[role]=jwt.sign({id,role,account_type:role==='PATIENT'?'PATIENT':'STAFF',sid:c.sessionKey},process.env.JWT_SECRET,{expiresIn:'1h'});
 }
 for(const [id,p,dept,status,offset] of [['safe-enc','safe-p',department.id,'TRIAGE',0],['safe-other-enc','safe-other-p','safe-other','WAITING',3600000]]){
  const at=Date.now()+offset;
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,assigned_doctor_id,is_discharged) VALUES (?,?,'RECEPTION','RECEPTION','safe-doctor',0)",[id,p]);
  await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at,encounter_id) VALUES (?,?,'safe-doctor',?,?,?,'Synthetic room','CHECKED_IN','Synthetic appointment','safe-doctor',?,?)",[id+'-apt',p,dept,new Date(at).toISOString(),new Date(at+900000).toISOString(),new Date().toISOString(),id]);
  await db.run("INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,'safe-doctor',1)",[id,id+'-apt',dept,id+'-token',new Date().toISOString().slice(0,10),status]);
 }
 await db.run("INSERT INTO lab_test_catalog (id,name,code,department,unit,reference_range) VALUES ('safe-test','Synthetic test','SAFE-LAB','Synthetic laboratory','unit','Synthetic range')");
 await db.run("INSERT INTO lab_orders (id,encounter_id,test_id,ordered_by,ordered_at,status) VALUES ('safe-other-lab','safe-other-enc','safe-test','safe-doctor',?,'ORDERED')",[new Date().toISOString()]);
});
after(async()=>{await new Promise(resolve=>db.db.close(resolve));fs.rmSync(root,{recursive:true,force:true});});

test('omitted allergy fields preserve the existing record and its patient version',async()=>{
 const patient=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 const response=await call('NURSE','post','/encounters/safe-enc/triage',{__v:1,data:vitals});
 assert.equal(response.status,200,JSON.stringify(response.body));
 const saved=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 assert.equal(saved.allergies,patient.allergies);assert.equal(saved.__v,patient.__v);
});
test('allergy change requires explicit review, patient version and attributed reason',async()=>{
 const q=await db.get("SELECT * FROM queue_entries WHERE encounter_id='safe-enc'");
 const patient=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 const body={__v:q.__v,reason:'Synthetic triage amendment',data:{...vitals,allergies:'',allergy_review_status:'NONE_REPORTED'}};
 assert.equal((await call('NURSE','post','/encounters/safe-enc/triage',body)).body.error.code,'ALLERGY_REVIEW_REQUIRED');
 assert.equal((await call('NURSE','post','/encounters/safe-enc/triage',{...body,allergy_review_confirmed:true,patient__v:0,allergy_change_reason:'Synthetic review'})).status,409);
 const changed=await call('NURSE','post','/encounters/safe-enc/triage',{...body,allergy_review_confirmed:true,patient__v:patient.__v,allergy_change_reason:'Synthetic review'});
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 const saved=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 assert.equal(saved.allergy_review_status,'NONE_REPORTED');assert.equal(saved.allergy_reviewed_by,'safe-nurse');assert.equal(saved.__v,patient.__v+1);
 assert.ok(await db.get("SELECT id FROM audit_logs WHERE action='PATIENT_ALLERGIES_REVIEWED' AND patient_id='safe-p'"));
});
test('caller-controlled emergency reason cannot grant another department read or write',async()=>{
 for(const headers of [{},{'X-Break-Glass-Reason':'x'},{'X-Break-Glass-Reason':'A detailed but unauthorized synthetic reason'}]){
  assert.equal((await call('NURSE','get','/patients/safe-other-p/record',undefined,headers)).status,403);
  assert.equal((await call('NURSE','post','/encounters/safe-other-enc/start-triage',{__v:1},headers)).status,403);
 }
});
test('nurse lab list and mutations remain confined to their department',async()=>{
 const result=await call('NURSE','get','/labs');assert.equal(result.status,200);
 assert.ok(!result.body.some(row=>row.id==='safe-other-lab'));
 assert.equal((await call('NURSE','post','/labs/safe-other-lab/collect',{__v:1})).status,403);
});
test('reception uses real identifiers, excludes clinical allergy fields and saves demographics',async()=>{
 const directory=await call('ADMIN','get','/patients?search=Synthetic');
 const patient=directory.body.find(row=>row.id==='safe-p');
 assert.equal(patient.mrn,'SYN-safe-p');assert.equal(patient.dob,'1995-01-01');assert.equal(patient.phone,'+919000001991');assert.equal(patient.allergies,undefined);
 const changed=await call('ADMIN','patch','/patients/safe-p',{__v:patient.__v,data:{address:'Synthetic corrected address'}});
 assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal((await call('ADMIN','get','/patients/safe-p/record')).status,403);
 assert.equal((await call('PATIENT','patch','/patients/safe-other-p',{__v:1,data:{address:'Forbidden'}})).status,404);
 assert.equal((await call('PATIENT','patch','/patients/safe-p',{__v:patient.__v,data:{address:'Stale'}})).status,409);
});
test('unapproved scoring cannot change the clinician-entered priority or claim a validated score',async()=>{
 const q=await db.get("SELECT * FROM queue_entries WHERE encounter_id='safe-enc'");
 const result=await call('NURSE','post','/encounters/safe-enc/triage',{__v:q.__v,reason:'Synthetic measurement amendment',data:{...vitals,temperature:40,pulse:130,spo2:90,systolic:80,diastolic:50}});
 assert.equal(result.status,200,JSON.stringify(result.body));
 const triage=await db.get("SELECT data FROM triage_records WHERE encounter_id='safe-enc' ORDER BY version DESC LIMIT 1");
 const data=JSON.parse(triage.data);assert.equal(data.priority,0);assert.equal(data.ews,null);assert.equal(data.ews_auto_elevated,false);
});

test('reception reassignment is versioned, same-department and blocked after clinical work starts',async()=>{
 const department=await db.get("SELECT * FROM departments WHERE prefix='OBST'");
 await db.run("INSERT INTO users (id,name,role,department,is_active,must_change_password) VALUES ('safe-new-doctor','Synthetic receiving doctor','DOCTOR',?,1,0)",[department.name]);
 const weekday=new Date().getDay();
 await db.run("INSERT INTO practitioner_schedules (id,doctor_id,department_id,weekday,start_time,end_time,slot_minutes,room) VALUES ('safe-new-schedule','safe-new-doctor',?,?,'00:00','23:59',5,'Synthetic receiving room')",[department.id,weekday]);
 const q=await db.get("SELECT * FROM queue_entries WHERE encounter_id='safe-enc'");
 const payload={doctor_id:'safe-new-doctor',__v:q.__v,reason:'Synthetic receiving clinician accepted unstarted visit'};
 assert.equal((await call('NURSE','post','/encounters/safe-enc/reassign',payload)).status,403);
 assert.equal((await call('ADMIN','post','/encounters/safe-enc/reassign',{...payload,__v:0})).status,422);
 const moved=await call('ADMIN','post','/encounters/safe-enc/reassign',payload);assert.equal(moved.status,200,JSON.stringify(moved.body));
 assert.equal((await db.get("SELECT assigned_doctor_id FROM encounters WHERE id='safe-enc'")).assigned_doctor_id,'safe-new-doctor');
 assert.ok(await db.get("SELECT id FROM audit_logs WHERE action='VISIT_REASSIGNED'"));
 assert.equal((await call('ADMIN','post','/encounters/safe-enc/reassign',payload)).status,409);
 const latest=await db.get("SELECT * FROM queue_entries WHERE encounter_id='safe-enc'");
 await db.run("INSERT INTO clinical_notes (id,encounter_id,draft_content,status,author_id,created_at,updated_at) VALUES ('safe-handover-note','safe-enc','{}','DRAFT','safe-new-doctor',?,?)",[new Date().toISOString(),new Date().toISOString()]);
 assert.equal((await call('ADMIN','post','/encounters/safe-enc/reassign',{doctor_id:'safe-doctor',__v:latest.__v,reason:'Synthetic invalid transfer after clinical work'})).body.error.code,'VISIT_HANDOVER_REQUIRED');
});

test('signing rejects a changed patient record and preserves the reviewed identity on the prescription',async()=>{
 const c=createSessionCredentials();await db.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,'safe-new-doctor',?,0,'STAFF')",[c.tokenHash,c.sessionKey,new Date(Date.now()+3600000).toISOString()]);tokens.RECEIVING_DOCTOR=jwt.sign({id:'safe-new-doctor',role:'DOCTOR',account_type:'STAFF',sid:c.sessionKey},process.env.JWT_SECRET,{expiresIn:'1h'});
 const q=await db.get("SELECT * FROM queue_entries WHERE encounter_id='safe-enc'");assert.equal((await call('RECEIVING_DOCTOR','post','/encounters/safe-enc/start',{__v:q.__v})).status,200);
 await db.run("INSERT INTO diagnosis_catalog (id,name) VALUES ('safe-diagnosis','Synthetic diagnosis')");
 const data={history:'Synthetic history',examination:'Synthetic examination',assessment:'Synthetic assessment',diagnosis_ids:['safe-diagnosis'],advice:'Synthetic advice',medications:[]};
 let patient=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 const version=patient.__v;
 assert.equal((await call('PATIENT','patch','/patients/safe-p',{__v:version,data:{name:'Synthetic name reviewed at signing'}})).status,200);
 assert.equal((await call('RECEIVING_DOCTOR','post','/encounters/safe-enc/complete',{__v:1,patient__v:version,data})).body.error.code,'PATIENT_RECORD_CHANGED');
 patient=await db.get("SELECT * FROM patients WHERE id='safe-p'");
 const signed=await call('RECEIVING_DOCTOR','post','/encounters/safe-enc/complete',{__v:1,patient__v:patient.__v,data});assert.equal(signed.status,200,JSON.stringify(signed.body));
 assert.equal((await call('PATIENT','patch','/patients/safe-p',{__v:patient.__v,data:{name:'Later synthetic profile edit'}})).status,200);
 const record=await call('PATIENT','get','/patients/safe-p/record');assert.equal(record.body.patient.name,'Later synthetic profile edit');assert.equal(record.body.prescriptions[0].rx_content.patient_snapshot.name,'Synthetic name reviewed at signing');assert.equal(record.body.prescriptions[0].rx_content.patient_snapshot.__v,patient.__v);
});

test('administrators see laboratory progress without clinical result values',async()=>{
 await db.run("UPDATE lab_orders SET status='AVAILABLE' WHERE id='safe-other-lab'");
 await db.run("INSERT INTO lab_results (id,order_id,version,value,unit,reference_range,flag,entered_by,verified_by,resulted_at,released,reason) VALUES ('safe-private-result','safe-other-lab',1,'Synthetic private value','unit','Synthetic range','NORMAL','safe-nurse','safe-nurse',?,1,'Synthetic privacy test')",[new Date().toISOString()]);
 const admin=await call('ADMIN','get','/labs');assert.equal(admin.status,200);const row=admin.body.find(l=>l.id==='safe-other-lab');assert.equal(row.status,'AVAILABLE');assert.equal(row.result,null);assert.ok(!JSON.stringify(admin.body).includes('Synthetic private value'));
 const doctor=await call('DOCTOR','get','/labs');assert.equal(doctor.body.find(l=>l.id==='safe-other-lab').result.value,'Synthetic private value');
});
