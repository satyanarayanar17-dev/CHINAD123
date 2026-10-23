const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-doctor-led-'));
const pg=process.env.OPD_TEST_POSTGRES==='true';
if(pg && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB||'') || new URL(process.env.DATABASE_URL).pathname!=='/'+process.env.CC_ISOLATED_TEST_DB))throw Error('Isolated PostgreSQL required');
Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'local_dev',OPD_DEMO_OTP:'true',ENABLE_LEGACY_API:'false',OPD_NOTIFICATION_WORKER:'false',OPD_OG_PILOT_ONLY:'false',OTP_COOLDOWN_SECONDS:'1',JWT_SECRET:'SyntheticDoctorLedRegression2026Only',...(!pg?{DB_DIALECT:'sqlite',SQLITE_PATH:path.join(root,'fixture.db')}:{})});
const request=require('supertest'),jwt=require('jsonwebtoken'),app=require('../server'),db=require('../database');
const {createSessionCredentials}=require('../middleware/auth');
const tokens={};let department;
const api=(who,method,url,body)=>request(app)[method]('/api/v1/opd'+url).auth(tokens[who]||who,{type:'bearer'}).send(body);
const profile=n=>({name:'Synthetic doctor-created '+n,phone:'+919000008'+String(n).padStart(3,'0'),dob:'1990-06-15',gender:'Female',address:'Synthetic address',city:'Chennai',state:'Tamil Nadu',pin_code:'600001',emergency_contact:'9000000099',portal_access_enabled:true});
const otpRequest=phone=>request(app).post('/api/v1/auth/opd/otp/request').send({phone});
const otpVerify=(phone,r,extra={})=>request(app).post('/api/v1/auth/opd/otp/verify').send({phone,code:r.development_code,challenge_id:r.challenge_id,...extra});
before(async()=>{
 await db.migrateDatabase(); department=await db.get("SELECT * FROM departments WHERE prefix='OBST'");
 for(const [id,role] of [['owner','DOCTOR'],['other','DOCTOR'],['nurse','NURSE'],['admin','ADMIN']]){
  await db.run('INSERT INTO users(id,name,role,department,is_active,must_change_password) VALUES (?,?,?,?,1,0)',[id,'Synthetic '+id,role,department.name]);
  const c=createSessionCredentials();await db.run("INSERT INTO refresh_tokens(id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?,?,0,'STAFF')",[c.tokenHash,c.sessionKey,id,new Date(Date.now()+3600000).toISOString()]);
  tokens[id]=jwt.sign({id,role,account_type:'STAFF',sid:c.sessionKey},process.env.JWT_SECRET,{expiresIn:'1h'});
 }
});
after(async()=>{if(db.pgPool)await db.pgPool.end();else await new Promise(r=>db.db.close(r));fs.rmSync(root,{recursive:true,force:true});});
test('OTP cannot create a profile, even when an old client sends registration details',async()=>{
 const p=profile(1),r=await otpRequest(p.phone);assert.equal(r.status,200);
 const login=await otpVerify(p.phone,r.body,{profile:p});assert.equal(login.status,403);assert.equal(login.body.error.code,'PATIENT_NOT_REGISTERED');
 assert.equal(await db.get('SELECT id FROM patients WHERE phone=?',[p.phone]),undefined);
});
test('doctor-created profile is assigned and supports mobile OTP sign-in without a visit',async()=>{
 const p=profile(2),created=await api('owner','post','/patients',{...p,assigned_doctor_id:'other'});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.assigned_doctor_id,'owner');assert.equal(created.body.portal_access_enabled,1);
 assert.equal((await api('owner','get','/patients?search='+encodeURIComponent(p.phone))).body[0].id,created.body.id);
 assert.equal((await api('other','get','/patients?search='+encodeURIComponent(p.phone))).body.length,0);
 assert.equal((await api('owner','get','/patients/'+created.body.id+'/record')).status,200);
 assert.equal((await api('other','get','/patients/'+created.body.id+'/record')).status,403);
 const r=await otpRequest(p.phone),login=await otpVerify(p.phone,r.body);assert.equal(login.status,200,JSON.stringify(login.body));
 assert.equal((await api(login.body.access_token,'get','/profile')).body.id,created.body.id);
 assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM encounters WHERE patient_id=?',[created.body.id])).n),0);
 assert.equal((await api('nurse','post','/patients',profile(9))).status,403);
});
test('only the assigned doctor can enable mobile access; disabling access revokes current sessions',async()=>{
 const p=profile(3),created=(await api('owner','post','/patients',{...p,portal_access_enabled:false})).body;
 const r=await otpRequest(p.phone);const denied=await otpVerify(p.phone,r.body);assert.equal(denied.status,403);assert.equal(denied.body.error.code,'PATIENT_ACCESS_DISABLED');
 const route='/patients/'+created.id+'/access';
 assert.equal((await api('other','patch',route,{portal_access_enabled:true,__v:1})).status,403);
 assert.equal((await api('owner','patch',route,{portal_access_enabled:true,__v:1})).status,200);
 const login=await otpVerify(p.phone,r.body);assert.equal(login.status,200);
 assert.equal((await api('owner','patch',route,{portal_access_enabled:false,__v:1})).status,409);
 assert.equal((await api('owner','patch',route,{portal_access_enabled:false,__v:2})).status,200);
 assert.equal((await api(login.body.access_token,'get','/profile')).status,401);
});
test('Start visit works without a booking or schedule and repeated taps resume one visit',async()=>{
 const created=(await api('owner','post','/patients',profile(4))).body,route='/patients/'+created.id+'/check-in';
 assert.equal((await api('other','post',route,{identity_verified:true})).status,403);
 assert.equal((await api('owner','post',route,{})).status,422);
 const results=await Promise.all([api('owner','post',route,{identity_verified:true}),api('owner','post',route,{identity_verified:true})]);
 for(const r of results){assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.patient_id,created.id);assert.equal(r.body.patient_name,created.name);assert.equal(r.body.doctor_id,'owner');assert.ok(r.body.token);}
 assert.equal(results[0].body.encounter_id,results[1].body.encounter_id);
 assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM encounters WHERE patient_id=?',[created.id])).n),1);
 const record=await api('owner','get','/patients/'+created.id+'/record');assert.equal(record.body.encounters.length,1);
});
test('pending arrival checks in once; retrying an old revision is safe and cannot cancel it',async()=>{
 const created=(await api('owner','post','/patients',profile(5))).body,at=new Date().toISOString();
 await db.run("INSERT INTO appointments(id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at,__v) VALUES ('pending-arrival',?,'owner',?,?,?,'OPD','PENDING_CONFIRMATION','Synthetic','owner',?,2)",[created.id,department.id,at,new Date(Date.now()+300000).toISOString(),at]);
 const route='/appointments/pending-arrival/check-in';
 assert.equal((await api('owner','post',route,{identity_verified:true,__v:1})).status,409);
 const first=await api('owner','post',route,{identity_verified:true,__v:2});assert.equal(first.status,200);
 const retry=await api('owner','post',route,{identity_verified:true,__v:2});assert.equal(retry.status,200);assert.equal(first.body.encounter_id,retry.body.encounter_id);
 assert.equal((await api('other','post',route,{identity_verified:true,__v:2})).status,403);
 assert.equal((await api('owner','post',route,{identity_verified:true,__v:'2'})).status,422);
 assert.equal((await db.get("SELECT status FROM appointments WHERE id='pending-arrival'")).status,'CHECKED_IN');
});
test('concurrent mobile-access removal cannot leave a usable patient login',async()=>{
 const p=profile(6),created=(await api('owner','post','/patients',p)).body,r=await otpRequest(p.phone);
 const [login,disabled]=await Promise.all([
  otpVerify(p.phone,r.body),
  api('owner','patch','/patients/'+created.id+'/access',{portal_access_enabled:false,__v:created.__v})
 ]);
 assert.equal(disabled.status,200,JSON.stringify(disabled.body));
 assert.ok([200,403].includes(login.status),JSON.stringify(login.body));
 if(login.status===200) assert.equal((await api(login.body.access_token,'get','/profile')).status,401);
 else assert.equal(login.body.error.code,'PATIENT_ACCESS_DISABLED');
});
test('cancelled visits cannot be checked in or used to claim a patient profile',async()=>{
 const created=(await api('owner','post','/patients',profile(7))).body,at=new Date().toISOString();
 await db.run("INSERT INTO appointments(id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at) VALUES ('cancelled-visit',?,'other',?,?,?,'OPD','CANCELLED','Synthetic','other',?)",[created.id,department.id,at,new Date(Date.now()+300000).toISOString(),at]);
 assert.equal((await api('other','post','/appointments/cancelled-visit/check-in',{identity_verified:true,__v:1})).status,409);
 assert.equal((await api('other','get','/patients?search='+created.mrn)).body.length,0);
 assert.equal((await api('other','post','/patients/'+created.id+'/check-in',{identity_verified:true})).status,403);
 assert.equal((await db.get("SELECT status FROM appointments WHERE id='cancelled-visit'")).status,'CANCELLED');
});
