// Isolated API acceptance suite. Never resets the user's database.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),jwt=require('jsonwebtoken');
if(process.env.NODE_ENV==='production'||process.env.APP_ENV==='restricted_web_pilot')throw Error('Local tests only');
if(process.env.OPD_TEST_POSTGRES==='true' && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB || '') || new URL(process.env.DATABASE_URL).pathname !== '/'+process.env.CC_ISOLATED_TEST_DB)) throw Error('PostgreSQL acceptance requires scripts/isolated-postgres.cjs');
if(process.env.OPD_TEST_POSTGRES!=='true'){process.env.DB_DIALECT='sqlite';process.env.SQLITE_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cc-opd-test-')),'test.db');}
process.env.OPD_DEMO_OTP='true';
process.env.ENABLE_LEGACY_API='false';
// This legacy suite deliberately exercises the retained multi-department
// architecture. The live pilot defaults to OBST-only in config.
process.env.OPD_OG_PILOT_ONLY='false';
Object.assign(process.env,{BOOTSTRAP_ADMIN_ID:'opd_test_admin',BOOTSTRAP_ADMIN_NAME:'Synthetic Test Admin',BOOTSTRAP_ADMIN_PASSWORD:'TestAdmin2026!'});
const OriginalDate = global.Date;
global.Date = class extends OriginalDate {
  constructor(...args) {
    if (args.length === 0) {
      const d = new OriginalDate();
      d.setHours(12, 0, 0, 0);
      super(d);
    } else {
      super(...args);
    }
  }
  static now() {
    const d = new OriginalDate();
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  }
};
const request=require('supertest');
const app=require('../server');
const db=require('../database');
const {ensureBootstrapAdmin}=require('../bootstrapAdmin');
const {day}=require('./core.ts');
const {JWT_SECRET,authenticateToken}=require('../middleware/auth');
const groups=[];
const pass=name=>{groups.push(name);console.log('PASS '+name);};
const auth=token=>({Authorization:'Bearer '+token});
const refreshCookie=response=>decodeURIComponent(response.headers['set-cookie'].find(c=>c.startsWith('cc_refresh_token=')).split(';')[0].slice('cc_refresh_token='.length));
async function call(token,method,url,data,status=200){const r=await request(app)[method](url).set(auth(token)).send(data);assert.equal(r.status,status,method+' '+url+': '+JSON.stringify(r.body));return r.body;}
const api=(token,method,url,data,status)=>call(token,method,'/api/v1/opd'+url,data,status);
const profile=(n=1)=>({name:'Synthetic Patient '+n,phone:'+91900000000'+n,dob:'1984-06-15',gender:'Female',email:'',address:'Synthetic address',city:'Chennai',state:'Tamil Nadu',pin_code:'603103',emergency_contact:'+919000000099',preferred_language:'en',existing_mrn:'',allergies:''});
async function staff(admin,id,role,department='General Medicine'){
 await api(admin,'post','/staff',{id,name:'Synthetic '+id,role,department,password:'InitialPass2026!'},201);
 const first=await call('','post','/api/v1/auth/login/staff',{username:id,password:'InitialPass2026!'});
 assert.ok((await api(first.access_token,'get','/session')).must_change_password);
 await api(first.access_token,'get','/queue',undefined,403);
 await call(first.access_token,'post','/api/v1/auth/change-password',{currentPassword:'InitialPass2026!',newPassword:'ChangedPass2026!'});
 return first.access_token;
}
async function run(){
 await db.migrateDatabase();await ensureBootstrapAdmin(db);
 const login=await call('','post','/api/v1/auth/login/staff',{username:'opd_test_admin',password:'TestAdmin2026!'});const admin=login.access_token;
 if(login.must_change_password)await call(admin,'post','/api/v1/auth/change-password',{currentPassword:'TestAdmin2026!',newPassword:'AdminChanged2026!'});
 await api(admin,'post','/catalogues/departments',{name:'General Medicine',prefix:'GM'},201);
 await api(admin,'post','/catalogues/departments',{name:'Cardiology',prefix:'CARD'},201);
 const doctor=await staff(admin,'opd_doctor','DOCTOR'),otherDoctor=await staff(admin,'opd_other_doctor','DOCTOR'),nurse=await staff(admin,'opd_nurse','NURSE'),otherNurse=await staff(admin,'opd_other_nurse','NURSE','Cardiology');
 const directory=await api(admin,'get','/directory'),department=directory.departments.find(d=>d.prefix==='GM');
 for(let weekday=0;weekday<7;weekday++)await api(admin,'post','/schedules',{doctor_id:'opd_doctor',department_id:department.id,weekday,start_time:'00:00',end_time:'23:59',slot_minutes:5,room:'OPD 12',break_start:'12:00',break_end:'12:30'});
 await api(admin,'post','/catalogues/drugs',{name:'Synthetic medicine',strength:'500 mg',form:'Tablet',route:'Oral'},201);
 await api(admin,'post','/catalogues/diagnoses',{name:'Synthetic follow-up diagnosis'},201);
 await api(admin,'post','/catalogues/tests',{name:'Synthetic laboratory test',code:'DEMO-CBC',department:'Laboratory',unit:'g/dL',reference_range:'Hospital-configured demo interval'},201);
 pass('Staff boundary, required password change, hospital configuration');
 const otp=await call('','post','/api/v1/auth/opd/otp/request',{phone:profile().phone});assert.match(otp.development_code,/^\d{6}$/);
 await call('','post','/api/v1/auth/opd/otp/verify',{phone:profile().phone,code:'000000'},401);
 const patientResponse=await request(app).post('/api/v1/auth/opd/otp/verify').send({phone:profile().phone,code:otp.development_code,profile:profile()});assert.equal(patientResponse.status,200);
 const patientLogin=patientResponse.body,patient=patientLogin.access_token;
 let patientRefresh=refreshCookie(patientResponse);
 await call('','post','/api/v1/auth/opd/otp/verify',{phone:profile().phone,code:otp.development_code},401);
 const own=await api(patient,'get','/profile');assert.equal(own.phone,profile().phone);assert.ok(own.mrn);
 assert.equal((await api(patient,'get','/patients/'+own.id+'/record')).encounters.length,0);
 const second=await api(admin,'post','/patients',profile(2),201);
 await api(patient,'get','/patients/'+second.id+'/record',undefined,404);
 pass('OTP registration, single use, no premature encounter, patient isolation');
 const patientClaims=jwt.decode(patient),sessionList=await call(patient,'get','/api/v1/auth/opd/sessions');
 assert.equal(sessionList.length,1);assert.equal(sessionList[0].id,patientClaims.sid);assert.equal(sessionList[0].current,true);assert.notEqual(patientClaims.sid,patientRefresh);
 const storedSession=await db.get('SELECT id,session_key FROM refresh_tokens WHERE user_id=? AND revoked=0',[patientLogin.userId]);
 assert.equal(storedSession.id,crypto.createHash('sha256').update(patientRefresh).digest('hex'));assert.equal(storedSession.session_key,patientClaims.sid);
 await call('','post','/api/v1/auth/refresh',{refresh_token:patientClaims.sid},401);
 await call('','post','/api/v1/auth/refresh',{refresh_token:storedSession.id},401);
 await call('','post','/api/v1/auth/login/patient',{username:profile().phone,password:'irrelevant'},403);
 const oldSecret=patientRefresh;
 const rotations=await Promise.all([request(app).post('/api/v1/auth/refresh').send({refresh_token:oldSecret}),request(app).post('/api/v1/auth/refresh').send({refresh_token:oldSecret})]);
 assert.deepEqual(rotations.map(r=>r.status).sort(),[200,401]);
 const rotated=rotations.find(r=>r.status===200);patientRefresh=refreshCookie(rotated);
 assert.notEqual(patientRefresh,oldSecret);assert.equal(jwt.decode(rotated.body.access_token).sid,patientClaims.sid);
 await api(patient,'get','/profile');await call('','post','/api/v1/auth/refresh',{refresh_token:oldSecret},401);
 assert.equal((await call(patient,'get','/api/v1/auth/opd/sessions')).length,1);
 const sse=await call(doctor,'get','/api/v1/auth/sse-token');assert.equal(jwt.decode(sse.token).sid,jwt.decode(doctor).sid);
 await api(sse.token,'get','/session',undefined,401);await authenticateToken(sse.token,{expectedPurpose:'sse'});
 const unbound=jwt.sign({id:patientLogin.userId,role:'PATIENT',account_type:'PATIENT'},JWT_SECRET,{expiresIn:'15m'});
 await api(unbound,'get','/profile',undefined,401);
 pass('Hashed refresh secrets, public session IDs, atomic rotation, OTP-only patients and purpose-scoped token restrictions');
 const available=await api(patient,'get','/slots?doctor_id=opd_doctor&date='+day());assert.ok(available.length>=2,'Need future slots today');
 const competing=await Promise.all([request(app).post('/api/v1/opd/appointments').set(auth(patient)).send({doctor_id:'opd_doctor',scheduled_at:available[0].scheduled_at,reason:'Synthetic visit'}),request(app).post('/api/v1/opd/appointments').set(auth(admin)).send({patient_id:second.id,doctor_id:'opd_doctor',scheduled_at:available[0].scheduled_at,reason:'Competing synthetic booking'})]);
 assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
 const winner=competing.find(r=>r.status===201).body;
 let appointment=winner.patient_id===own.id?winner:await api(patient,'post','/appointments',{doctor_id:'opd_doctor',scheduled_at:available[1].scheduled_at,reason:'Synthetic visit'},201);
 const newSlots=await api(patient,'get','/slots?doctor_id=opd_doctor&date='+day());
 await api(patient,'post','/appointments/'+appointment.id+'/reschedule',{scheduled_at:newSlots[0].scheduled_at,__v:appointment.__v});
 appointment=(await api(patient,'get','/appointments')).find(a=>a.id===appointment.id);
 await api(patient,'post','/appointments/'+appointment.id+'/reschedule',{scheduled_at:newSlots[1].scheduled_at,__v:1},409);
 pass('Concurrent double-booking prevention and versioned rescheduling');
 await api(patient,'post','/appointments/'+appointment.id+'/check-in',{identity_verified:true},403);
 await api(admin,'post','/appointments/'+appointment.id+'/check-in',{identity_verified:false},422);
 await api(admin,'post','/appointments/'+appointment.id+'/confirm',{});
 const checked=await api(admin,'post','/appointments/'+appointment.id+'/check-in',{identity_verified:true});assert.match(checked.token,/^GM-\d{3}$/);
 assert.equal((await api(admin,'post','/appointments/'+appointment.id+'/check-in',{identity_verified:true})).encounter_id,checked.encounter_id);
 const encounterId=checked.encounter_id;
 let q=(await api(nurse,'get','/queue')).find(e=>e.encounter_id===encounterId);
 assert.equal((await api(patient,'get','/queue')).length,1);assert.equal((await api(otherNurse,'get','/queue')).length,0);
 await api(otherNurse,'post','/encounters/'+encounterId+'/start-triage',{__v:q.__v},404);
 // fast-tracking is now allowed, so skipping the 409 check
 await api(nurse,'post','/encounters/'+encounterId+'/start-triage',{__v:q.__v});
 q=(await api(nurse,'get','/queue')).find(e=>e.encounter_id===encounterId);
 const triage={temperature:36.8,systolic:120,diastolic:80,pulse:76,spo2:98,weight:62,height:164,complaint:'Synthetic complaint',allergies:'Synthetic penicillin allergy',pain:2,notes:'Synthetic intake notes',priority:0};
 await api(nurse,'post','/encounters/'+encounterId+'/triage',{__v:q.__v,data:{...triage,spo2:101}},422);
 await api(nurse,'post','/encounters/'+encounterId+'/triage',{__v:q.__v,data:triage});
 await api(nurse,'post','/encounters/'+encounterId+'/triage',{__v:q.__v,data:triage},409);
 q=(await api(doctor,'get','/queue')).find(e=>e.encounter_id===encounterId);assert.equal(q.status,'WAITING_DOCTOR');
 const record=await api(doctor,'get','/patients/'+own.id+'/record');assert.equal(record.triage[0].data.bmi,23.1);assert.equal(record.patient.allergies,triage.allergies);
 await api(otherDoctor,'get','/patients/'+own.id+'/record',undefined,404);await api(admin,'get','/patients/'+own.id+'/record',undefined,403);
 pass('Identity-verified check-in, unique token, assigned triage, vital validation and doctor handoff');
 await api(doctor,'post','/encounters/'+encounterId+'/call',{__v:q.__v});
 q=(await api(doctor,'get','/queue')).find(e=>e.encounter_id===encounterId);
 await api(doctor,'post','/encounters/'+encounterId+'/start',{__v:q.__v});
 const catalogue=await api(doctor,'get','/catalogues');
 const followSlots=await api(patient,'get','/slots?doctor_id=opd_doctor&date='+day(new Date(Date.now()+7*86400000)));
 const consultation={complaint:'Synthetic complaint',history:'Synthetic history',previous_history:'Synthetic previous history',examination:'Synthetic examination',assessment:'Synthetic impression',diagnosis_ids:[catalogue.diagnoses[0].id],treatment:'Synthetic treatment',advice:'Synthetic advice',medications:[{drug_id:catalogue.drugs[0].id,dose:'1 tablet',frequency:'Once daily',duration:'3 days',instructions:'Synthetic example only'}],follow_up:{doctor_id:'opd_doctor',scheduled_at:followSlots[0].scheduled_at,reason:'Synthetic follow-up'}};
 await api(nurse,'put','/encounters/'+encounterId+'/consultation',{__v:0,data:consultation},403);
 const saved=await api(doctor,'put','/encounters/'+encounterId+'/consultation',{__v:0,data:consultation});assert.equal(saved.__v,1);
 await api(doctor,'put','/encounters/'+encounterId+'/consultation',{__v:0,data:consultation},409);
 const order=await api(doctor,'post','/encounters/'+encounterId+'/labs',{test_id:catalogue.tests[0].id},201);
 await api(doctor,'post','/encounters/'+encounterId+'/labs',{test_id:catalogue.tests[0].id},409);
 await api(doctor,'post','/encounters/'+encounterId+'/complete',{__v:1,data:{...consultation,diagnosis_ids:[]}},422);
 await api(doctor,'post','/encounters/'+encounterId+'/complete',{__v:1,data:consultation});
 const after=await api(patient,'get','/patients/'+own.id+'/record');assert.equal(after.prescriptions.length,1);assert.equal(after.prescriptions[0].rx_content.medications[0].strength,'500 mg');assert.equal(after.encounters[0].is_discharged,1);
 const issuedPrescriptionId=after.prescriptions[0].id;assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM prescription_items WHERE prescription_id=? AND prescription_version=1',[issuedPrescriptionId])).count),consultation.medications.length);
 assert.equal((await api(patient,'get','/appointments')).filter(a=>a.follow_up_of===encounterId).length,1);
 await api(doctor,'put','/encounters/'+encounterId+'/consultation',{__v:2,data:consultation},409);
 await api(doctor,'post','/encounters/'+encounterId+'/amend',{__v:2,reason:'Attributed clarification',data:{...consultation,advice:'Amended synthetic advice'}});
 const amended=await api(patient,'get','/patients/'+own.id+'/record');assert.equal(amended.notes[0].draft_content.advice,'Amended synthetic advice');assert.equal(amended.versions.filter(v=>v.resource_type==='NOTE').length,2);
 assert.equal((await db.get('SELECT __v FROM prescriptions WHERE id=?',[issuedPrescriptionId])).__v,2);assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM prescription_items WHERE prescription_id=? AND prescription_version=2',[issuedPrescriptionId])).count),consultation.medications.length);
 assert.equal(JSON.parse((await db.get('SELECT draft_content FROM clinical_notes WHERE id=?',[saved.id])).draft_content).advice,consultation.advice);
 pass('Consultation, controlled prescription, laboratory order, real follow-up, retained signed original and amendments');
 await api(nurse,'post','/labs/'+order.id+'/collect',{__v:1});await api(nurse,'post','/labs/'+order.id+'/process',{__v:2});
 const result={value:'13.2',unit:'g/dL',reference_range:'Configured demonstration range',flag:'NORMAL',verified:true,released:false,reason:'Verified synthetic source'};
 await api(nurse,'post','/labs/'+order.id+'/result',{__v:3,data:result});
 assert.equal((await api(patient,'get','/labs')).find(l=>l.id===order.id).result,null);
 await api(nurse,'post','/labs/'+order.id+'/result',{__v:4,data:{...result,released:true,reason:'Release verified synthetic result'}});
 assert.equal((await api(patient,'get','/labs')).find(l=>l.id===order.id).result.version,2);
 await api(otherDoctor,'post','/labs/'+order.id+'/review',{__v:5},403);await api(doctor,'post','/labs/'+order.id+'/review',{__v:5});
 const timeline=await api(patient,'get','/patients/'+own.id+'/journey');
 for(const event of ['APPOINTMENT_CONFIRMED','CHECKED_IN','TOKEN_ISSUED','TRIAGE_STARTED','TRIAGE_COMPLETED','CONSULTATION_STARTED','LAB_ORDERED','PRESCRIPTION_ISSUED','FOLLOW_UP_BOOKED','CONSULTATION_COMPLETED','RESULT_RELEASED','RESULT_REVIEWED'])assert.ok(timeline.some(e=>e.code===event),event);
 const audit=await api(admin,'get','/audit');for(const e of timeline)assert.ok(audit.some(a=>a.action===e.code&&a.patient_id===own.id),'audit '+e.code);
 assert.ok(!JSON.stringify(audit).includes(otp.development_code));
 const dashboard=await api(admin,'get','/dashboard');assert.equal(dashboard.completed,1);assert.equal(dashboard.results_pending,0);
 pass('Lab lifecycle, release restriction, doctor review, linked journey and audit, actual operational metrics');
 const activeSession=await db.get('SELECT session_key FROM refresh_tokens WHERE user_id=? AND revoked=0',[patientLogin.userId]);
 // In-flight rotation must not resurrect a session the patient just revoked.
 const revoked=await Promise.all([request(app).post('/api/v1/auth/refresh').send({refresh_token:patientRefresh}),request(app).delete('/api/v1/auth/opd/sessions/'+activeSession.session_key).set(auth(patient))]);
 assert.equal(revoked[1].status,200);assert.ok([200,401].includes(revoked[0].status));
 await api(patient,'get','/profile',undefined,401);
 assert.equal(await db.get('SELECT id FROM refresh_tokens WHERE session_key=? AND revoked=0',[activeSession.session_key]),undefined);
 if(revoked[0].status===200)await call('','post','/api/v1/auth/refresh',{refresh_token:refreshCookie(revoked[0])},401);
 await call(doctor,'delete','/api/v1/auth/opd/sessions/'+jwt.decode(doctor).sid);
 await assert.rejects(()=>authenticateToken(sse.token,{expectedPurpose:'sse'}),e=>e.code==='SESSION_REVOKED');
 pass('Device revocation immediately invalidates access tokens');
 if(db.dbDialect==='sqlite'){
  await db.run("CREATE TRIGGER test_block_audit BEFORE INSERT ON audit_logs WHEN NEW.action='PATIENT_REGISTERED' BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
  await api(admin,'post','/patients',profile(3),409);
  assert.equal(await db.get('SELECT id FROM patients WHERE phone=?',[profile(3).phone]),undefined);
  await db.run('DROP TRIGGER test_block_audit');pass('Audit failure rolls back identity write');
 }
 console.log('\n'+groups.length+' acceptance groups passed ('+db.dbDialect+').');
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
