// Purpose-built disposable QA data. Every clinical transition uses the real API.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const mode=process.argv[2],port=Number(process.argv[3]),webPort=Number(process.argv[4]);
const ports={opd:[3002,5174],clinical:[3005,5177],security:[3003,5175],localization:[3004,5176],responsive:[3007,5179],print:[3006,5178]};
if(!ports[mode]||port!==ports[mode][0]||webPort!==ports[mode][1])throw Error('Unknown isolated fixture.');
const postgres=process.env.DB_DIALECT==='postgres';
if(postgres){
 const url=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB||'')||url.pathname!=='/'+process.env.CC_ISOLATED_TEST_DB)throw Error('Disposable PostgreSQL database required');
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cc-browser-'+mode+'-'));
Object.assign(process.env,{NODE_ENV:'development',APP_ENV:'local_dev',OPD_DEMO_OTP:'true',OTP_COOLDOWN_SECONDS:mode==='security'?'60':'1',DB_DIALECT:postgres?'postgres':'sqlite',SQLITE_PATH:path.join(root,'fixture.db'),PATIENT_DOCUMENT_STORAGE_PATH:path.join(root,'documents'),PORT:String(port),CORS_ORIGIN:'http://127.0.0.1:'+webPort,JWT_SECRET:mode==='security'?'9087a416cd21b1b746a211731b4a7099ecb073d9a16a4a44':crypto.randomBytes(32).toString('hex'),ENABLE_LEGACY_API:'false',OPD_NOTIFICATION_WORKER:'false',OPD_OG_PILOT_ONLY:mode==='security'?'false':'true',TRUST_PROXY:'loopback',BOOTSTRAP_ADMIN_ID:'admin',BOOTSTRAP_ADMIN_NAME:'Synthetic Administrator',BOOTSTRAP_ADMIN_PASSWORD:'ChettinadDemo2026!'});
// Freeze the calendar at clinic hours while allowing expiry/cooldown clocks to advance.
const RealDate=Date,realStart=RealDate.now();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new RealDate());const epoch=new RealDate(today+'T04:30:00Z').getTime();
global.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[epoch+RealDate.now()-realStart]));}static now(){return epoch+RealDate.now()-realStart;}};
const app=require('../backend/server'),db=require('../backend/database'),request=require('../backend/node_modules/supertest');const tokens={};
async function call(token,method,url,body,status){const r=await request(app)[method](url).set('Authorization',token?'Bearer '+token:'').send(body);if(status?r.status!==status:![200,201].includes(r.status))throw Error(`${method} ${url}: ${r.status} ${r.body.error?.code}`);return r.body;}
const api=(who,method,url,body,status)=>call(tokens[who],method,'/api/v1/opd'+url,body,status);
async function login(id,password='ChettinadDemo2026!'){const r=await call(null,'post','/api/v1/auth/login/staff',{username:id,password});tokens[id]=r.access_token;}
async function staff(id,name,role){await api('admin','post','/staff',{id,name,role,department:'Obstetrics & Gynaecology',password:'ChettinadInitial2026!'});await login(id,'ChettinadInitial2026!');await call(tokens[id],'post','/api/v1/auth/change-password',{currentPassword:'ChettinadInitial2026!',newPassword:'ChettinadDemo2026!'});await login(id);}
async function patient(number,name){const phone='900000000'+number;await api(tokens.demo_doctor?'demo_doctor':'admin','post','/patients',{name,phone,dob:'1990-01-01',gender:'Female',address:'Synthetic address',city:'Chennai',state:'Tamil Nadu',pin_code:'600001',emergency_contact:'9000000099',preferred_language:'en',allergies:'Synthetic allergy note'});const otp=await call(null,'post','/api/v1/auth/opd/otp/request',{phone});const auth=await call(null,'post','/api/v1/auth/opd/otp/verify',{phone,code:otp.development_code,challenge_id:otp.challenge_id,purpose:'PATIENT_LOGIN',profile:{name,dob:'1990-01-01',gender:'Female',address:'Synthetic address',city:'Chennai',state:'Tamil Nadu',pin_code:'600001',emergency_contact:'9000000099',preferred_language:'en',allergies:'Synthetic allergy note'}});tokens[phone]=auth.access_token;const own=await call(tokens[phone],'get','/api/v1/opd/session');return {phone,id:own.patient_id};}
const vitals={temperature:37,systolic:120,diastolic:80,pulse:74,spo2:99,weight:60,height:160,pain:0,priority:0,complaint:'Synthetic fixture complaint'};
(async()=>{
 await db.migrateDatabase();await require('../backend/bootstrapAdmin').ensureBootstrapAdmin(db);await login('admin');
 if(mode==='security'){await patient('1','Ananya Raman (Demo)');}
 else{
 await staff('demo_admin','Synthetic Reception','ADMIN');await staff('dr_prabha','Dr. Prabha S.','DOCTOR');await staff('demo_doctor','Synthetic OBST Doctor','DOCTOR');await staff('demo_nurse','Synthetic OBST Nurse','NURSE');
 const directory=await api('admin','get','/directory');const department=directory.departments.find(d=>d.prefix==='OBST');
 for(const doctor of ['dr_prabha','demo_doctor'])for(let weekday=0;weekday<7;weekday++)await api('admin','post','/schedules',{doctor_id:doctor,department_id:department.id,weekday,start_time:'00:00',end_time:'23:59',slot_minutes:5,room:'Synthetic '+doctor});
 await api('admin','post','/catalogues/drugs',{name:'Paracetamol',strength:'500 mg',form:'Tablet',route:'Oral'});
 await api('admin','post','/catalogues/drugs',{name:'Metformin',strength:'500 mg',form:'Tablet',route:'Oral'});
 await api('admin','post','/catalogues/diagnoses',{name:'Normal Pregnancy'});await api('admin','post','/catalogues/diagnoses',{name:'Type 2 diabetes follow-up (Demo)'});
 await api('admin','post','/catalogues/tests',{name:'Haemoglobin (Demo)',code:'DEMO-HB',department:'Synthetic laboratory',unit:'g/dL',reference_range:'Synthetic range'});await api('admin','post','/catalogues/tests',{name:'HbA1c (Demo)',code:'DEMO-HBA1C',department:'Synthetic laboratory',unit:'%',reference_range:'Synthetic range'});
 const catalogue=await api('admin','get','/catalogues');const drug=catalogue.drugs[0],dx=catalogue.diagnoses[0],hb=catalogue.tests.find(t=>t.code==='DEMO-HB');
 for(const [number,name,phase] of [['1','Ananya Raman (Demo)','TRIAGE'],['6','Meenakshi Sundaram (Demo)','FINALIZED'],['2','Karthik Srinivasan (Demo)','CONSULTING']]){
  const p=await patient(number,name),slots=await api('admin','get','/slots?doctor_id=demo_doctor&date='+today);if(!slots.length)throw Error('No fixture slots');
  const apt=await api(p.phone,'post','/appointments',{doctor_id:'demo_doctor',scheduled_at:slots[0].scheduled_at,reason:'Synthetic fixture visit'});await api('admin','post','/appointments/'+apt.id+'/confirm',{});await api('admin','post','/appointments/'+apt.id+'/check-in',{identity_verified:true});
  let q=(await api('demo_nurse','get','/queue')).find(q=>q.patient_id===p.id);if(!q)throw Error('Check-in did not create a queue entry');
  if(phase==='TRIAGE')continue;
  await api('demo_nurse','post','/encounters/'+q.encounter_id+'/start-triage',{__v:q.__v});
  q=(await api('demo_nurse','get','/queue')).find(q=>q.patient_id===p.id);
  await api('demo_nurse','post','/encounters/'+q.encounter_id+'/triage',{__v:q.__v,data:vitals});q=(await api('demo_doctor','get','/queue')).find(q=>q.patient_id===p.id);await api('demo_doctor','post','/encounters/'+q.encounter_id+'/start',{__v:q.__v});
  const data={complaint:'Synthetic complaint',history:'Synthetic saved history',examination:'Synthetic findings',assessment:'Synthetic assessment',diagnosis_ids:[dx.id],advice:'Synthetic instructions only',medications:[{drug_id:drug.id,dose:'1 tablet',frequency:'Once daily',duration:'3 days',instructions:'Synthetic example only'}]};
  await api('demo_doctor','put','/encounters/'+q.encounter_id+'/consultation',{__v:0,data});
  const lab=await api('demo_doctor','post','/encounters/'+q.encounter_id+'/labs',{test_id:phase==='FINALIZED'?hb.id:catalogue.tests.find(t=>t.code==='DEMO-HBA1C').id});
  if(phase==='FINALIZED'){
   await api('demo_doctor','post','/encounters/'+q.encounter_id+'/complete',{__v:1,data});await api('demo_nurse','post','/labs/'+lab.id+'/collect',{__v:1});await api('demo_nurse','post','/labs/'+lab.id+'/process',{__v:2});await api('demo_nurse','post','/labs/'+lab.id+'/result',{__v:3,data:{value:'12.0',unit:'g/dL',reference_range:'Synthetic range',flag:'NORMAL',verified:true,released:true,reason:'Synthetic verified report'}});
  }
 }
 }
 const server=app.listen(port,'127.0.0.1',()=>console.log('Disposable '+mode+' fixture ready on '+port));
 const closeDb=async()=>{if(postgres)await db.pgPool.end();else await new Promise(resolve=>db.db.close(resolve));};
 const cleanup=()=>server.close(async()=>{await closeDb();fs.rmSync(root,{recursive:true,force:true});process.exit(0);});process.once('SIGTERM',cleanup);process.once('SIGINT',cleanup);
})().catch(async error=>{console.error(error.message);if(postgres)await db.pgPool.end();else await new Promise(resolve=>db.db.close(resolve));fs.rmSync(root,{recursive:true,force:true});process.exit(1);});
