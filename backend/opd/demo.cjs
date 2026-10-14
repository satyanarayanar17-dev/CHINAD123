// Synthetic demo only. Preserve an existing database; never seed a locked deployment.
const path=require('node:path');
if(process.env.NODE_ENV==='production'||(process.env.APP_ENV&&process.env.APP_ENV!=='local_dev'))throw Error('Demo data is available only in local_dev.');
Object.assign(process.env,{APP_ENV:'local_dev',NODE_ENV:'development',DB_DIALECT:'sqlite',SQLITE_PATH:process.env.SQLITE_PATH||path.resolve(__dirname,'../connected-opd-demo.db'),OPD_DEMO_OTP:'true',OTP_DELIVERY_PROVIDER:'development',BOOTSTRAP_ADMIN_ID:'admin',BOOTSTRAP_ADMIN_NAME:'Demo Administrator',BOOTSTRAP_ADMIN_PASSWORD:'ChettinadDemo2026!'});
const request=require('supertest'),app=require('../server'),db=require('../database');
const tokens={};
async function call(token,method,url,body){const response=await request(app)[method](url).set('Authorization',token?'Bearer '+token:'').send(body);if(![200,201].includes(response.status))throw Error(`Demo fixture failed: ${method} ${url} ${response.status}`);return response.body;}
const api=(actor,method,url,body)=>call(tokens[actor],method,'/api/v1/opd'+url,body);
async function staff(id,name,role){await api('admin','post','/staff',{id,name,role,department:'Obstetrics & Gynaecology',password:'DemoInitial2026!'});let login=await call(null,'post','/api/v1/auth/login/staff',{username:id,password:'DemoInitial2026!'});await call(login.access_token,'post','/api/v1/auth/change-password',{currentPassword:'DemoInitial2026!',newPassword:'ChettinadDemo2026!'});login=await call(null,'post','/api/v1/auth/login/staff',{username:id,password:'ChettinadDemo2026!'});tokens[id]=login.access_token;}
(async()=>{
 await db.migrateDatabase();
 const patients=await db.get('SELECT count(*) AS n FROM patients'),doctors=await db.get("SELECT count(*) AS n FROM users WHERE role='DOCTOR'");
 if(Number(patients.n)||Number(doctors.n)){console.log('Existing demo records preserved.');return;}
 await require('../bootstrapAdmin').ensureBootstrapAdmin(db);
 tokens.admin=(await call(null,'post','/api/v1/auth/login/staff',{username:'admin',password:'ChettinadDemo2026!'})).access_token;
 await staff('dr_prabha','Dr. Prabha S. (Demo)','DOCTOR');await staff('dr_sailatha','Dr. Sailatha Ramanujam (Demo)','DOCTOR');await staff('demo_nurse','Demo Nurse','NURSE');
 const directory=await api('admin','get','/directory'),dept=directory.departments.find(d=>d.prefix==='OBST');
 for(const doctor of ['dr_prabha','dr_sailatha'])for(let weekday=0;weekday<7;weekday++)await api('admin','post','/schedules',{doctor_id:doctor,department_id:dept.id,weekday,start_time:'00:00',end_time:'23:59',slot_minutes:5,room:'Demo OPD'});
 await api('admin','post','/catalogues/drugs',{name:'Paracetamol (Demo)',strength:'500 mg',form:'Tablet',route:'Oral'});
 await api('admin','post','/catalogues/diagnoses',{name:'Synthetic assessment (Demo)'});
 await api('admin','post','/catalogues/tests',{name:'Synthetic laboratory test (Demo)',code:'DEMO-TEST',department:'Demo laboratory',unit:'Demo unit',reference_range:'Synthetic example only'});
 const otp=await call(null,'post','/api/v1/auth/opd/otp/request',{phone:'9000000001'});
 const login=await call(null,'post','/api/v1/auth/opd/otp/verify',{phone:'9000000001',code:otp.development_code,challenge_id:otp.challenge_id,purpose:'PATIENT_LOGIN',profile:{name:'Ananya Demo',dob:'1995-06-15',gender:'Female',address:'Synthetic address',city:'Chennai',state:'Tamil Nadu',pin_code:'600001',emergency_contact:'9000000002',preferred_language:'en',allergies:''}});
 tokens.patient=login.access_token;
 const profile=await api('patient','get','/profile');
 const today=require('./core.ts').day();let slots=await api('patient','get','/slots?doctor_id=dr_prabha&date='+today);
 if(!slots.length){const next=require('./core.ts').day(new Date(Date.now()+86400000));slots=await api('patient','get','/slots?doctor_id=dr_prabha&date='+next);}
 if(!slots.length)throw Error('No synthetic appointment slot.');
 const apt=await api('patient','post','/appointments',{doctor_id:'dr_prabha',scheduled_at:slots[0].scheduled_at,reason:'Synthetic OBST demonstration'});await api('admin','post','/appointments/'+apt.id+'/confirm',{});
 if(require('./core.ts').day(new Date(apt.scheduled_at))===today)await api('admin','post','/appointments/'+apt.id+'/check-in',{identity_verified:true});
 // A real private file goes through the same content validation and upload route as patient reports.
 const stream='BT /F1 14 Tf 50 750 Td (Synthetic demo document. No clinical results.) Tj ET';
 const objects=['<</Type/Catalog/Pages 2 0 R>>','<</Type/Pages/Count 1/Kids[3 0 R]>>','<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>','<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',`<</Length ${Buffer.byteLength(stream)}>>\nstream\n${stream}\nendstream`];
 let output='%PDF-1.4\n',offsets=[0];for(let index=0;index<objects.length;index++){offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${objects[index]}\nendobj\n`;}
 const xref=Buffer.byteLength(output);output+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
 const pdf=Buffer.from(output);
 const upload=await request(app).post('/api/v1/opd/patient-documents/'+profile.id).set('Authorization','Bearer '+tokens.patient).field('document_type','OTHER_MEDICAL_RECORD').field('title','Synthetic demonstration document').field('clinical_date',today).attach('file',pdf,{filename:'synthetic-demo.pdf',contentType:'application/pdf'});
 if(upload.status!==201)throw Error('Synthetic document upload failed.');
 console.log('Synthetic demo seeded through verified APIs. Demo sign-in instructions: docs/V2_DEMO.md');
})().then(()=>new Promise(resolve=>db.db.close(resolve))).catch(error=>{console.error(error.message);db.db.close(()=>process.exit(1));});
