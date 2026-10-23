const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
Object.assign(process.env,{NODE_ENV:'development',APP_ENV:'local_dev',DB_DIALECT:'sqlite',SQLITE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cc-otp-')),'test.db'),OPD_DEMO_OTP:'true',OPD_OG_PILOT_ONLY:'false'});
if(process.env.OPD_TEST_POSTGRES==='true') {
  if(!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB || '') || new URL(process.env.DATABASE_URL).pathname !== '/'+process.env.CC_ISOLATED_TEST_DB) throw Error('Isolated PostgreSQL wrapper required');
  process.env.DB_DIALECT='postgres';
}
const request=require('supertest'),app=require('../server'),db=require('../database');
const {phone}=require('./core.ts');
const {otpRateLimit}=require('./otp.ts');
const {loadRuntimeConfig,validateRuntimeConfig}=require('../config');
const send=(phone,extra={})=>request(app).post('/api/v1/auth/opd/otp/request').send({phone,...extra});
const verify=(phone,code,extra={})=>request(app).post('/api/v1/auth/opd/otp/verify').send({phone,code,...extra});
let n=10;
const mobile=()=>'+91900000'+String(n++).padStart(4,'0');
before(()=>db.migrateDatabase());
after(()=>db.dbDialect==='postgres'?db.pgPool.end():new Promise((resolve,reject)=>db.db.close(e=>e?reject(e):resolve())));
test('normalization accepts Indian national, trunk and international formats; rejects malformed input',()=>{
 for(const v of ['9503344617','09503344617','+919503344617','91 95033 44617']) assert.equal(phone.parse(v),'+919503344617');
 for(const v of ['123','+19503344617','abc9503344617','00919503344617']) assert.equal(phone.safeParse(v).success,false);
});
test('production combined with staging cannot expose demo OTP or omit SMS configuration',()=>{
 const result=validateRuntimeConfig(loadRuntimeConfig({NODE_ENV:'production',APP_ENV:'staging',OPD_DEMO_OTP:'true',OTP_DELIVERY_PROVIDER:'webhook'}));
 assert.ok(result.errors.some(e=>e.includes('OPD_DEMO_OTP')));assert.ok(result.errors.some(e=>e.includes('SMS_WEBHOOK_URL')));assert.ok(result.errors.some(e=>e.includes('SMS_WEBHOOK_TOKEN')));
});
test('request stores challenge-bound hash, requires purpose, enforces canonical resend cooldown',async()=>{
 const p=mobile(),r=await send(p);assert.equal(r.status,200);assert.match(r.body.challenge_id,/^[a-f0-9-]+$/);
 const row=await db.get('SELECT * FROM patient_otps WHERE phone=?',[p]);assert.notEqual(row.hash,r.body.development_code);assert.equal(row.hash.length,64);assert.equal(row.delivered,1);
 assert.equal((await send('0'+p.slice(3))).status,429);
 assert.equal((await verify(p,r.body.development_code,{purpose:'ACCOUNT_RECOVERY'})).status,401);
 assert.equal((await verify(p,r.body.development_code,{challenge_id:'wrong'})).status,401);
});
test('invalid, expired, locked, previous and undelivered challenges fail',async()=>{
 const p=mobile(),r=await send(p),code=r.body.development_code;
 for(let i=0;i<5;i++) assert.equal((await verify(p,'000000')).status,401);
 assert.equal((await verify(p,code)).status,401);
 await db.run("UPDATE patient_otps SET attempts=0,expires_at='2000-01-01' WHERE phone=?",[p]);assert.equal((await verify(p,code)).status,401);
 await db.run("UPDATE patient_otps SET sent_at='2000-01-01' WHERE phone=?",[p]);
 const newer=await send(p);assert.equal(newer.status,200);
 assert.equal((await verify(p,code,{challenge_id:r.body.challenge_id})).status,401);
 await db.run('UPDATE patient_otps SET delivered=0 WHERE phone=?',[p]);assert.equal((await verify(p,newer.body.development_code)).status,401);
});
test('concurrent valid verification creates one session; replay fails; logout revokes; patient ownership enforced',async()=>{
 const p=mobile();await db.run("INSERT INTO patients(id,name,phone,dob,gender,mrn) VALUES ('otp-patient','Synthetic OTP',?,'1990-01-01','Female','OTP-TEST')",[p]);
 const r=await send(p);const responses=await Promise.all([verify(p,r.body.development_code),verify(p,r.body.development_code)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
 const login=responses.find(r=>r.status===200),token=login.body.access_token;
 assert.ok((await db.get("SELECT phone_verified_at FROM patients WHERE id='otp-patient'")).phone_verified_at);
 assert.equal((await verify(p,r.body.development_code)).status,401);
 assert.equal((await request(app).get('/api/v1/opd/profile')).status,401);
 assert.equal((await request(app).get('/api/v1/opd/profile').auth(token,{type:'bearer'})).status,200);
 await db.run("INSERT INTO patients(id,name,dob,gender,mrn) VALUES ('otp-other','Synthetic Other','1990-01-01','Female','OTP-OTHER')");
 for(const endpoint of ['/patients/otp-other/record','/patients/otp-other/journey']) assert.equal((await request(app).get('/api/v1/opd'+endpoint).auth(token,{type:'bearer'})).status,404);
 const cookie=login.headers['set-cookie'][0].split(';')[0];assert.ok(login.headers['set-cookie'][0].includes('HttpOnly'));
 assert.equal((await request(app).post('/api/v1/auth/logout').set('Cookie',cookie).send({})).status,200);
 assert.equal((await request(app).get('/api/v1/opd/profile').auth(token,{type:'bearer'})).status,401);
});
test('durable phone short/long and IP request/verify limits',async()=>{
 const p=mobile();for(let i=0;i<5;i++) await otpRateLimit(p,'phone-test');
 await assert.rejects(otpRateLimit(p,'other-ip'),e=>e.status===429);
 for(let i=0;i<20;i++) await otpRateLimit(mobile(),'ip-test');
 await assert.rejects(otpRateLimit(mobile(),'ip-test'),e=>e.status===429);
 for(let i=0;i<20;i++) await otpRateLimit(p,'verify-test',true);
 await assert.rejects(otpRateLimit(p,'verify-test',true),e=>e.status===429);
 // Age only the short window while retaining the rolling hour.
 const {createHmac}=require('node:crypto'),{JWT_SECRET}=require('../middleware/auth');
 const q=mobile(),key=createHmac('sha256',JWT_SECRET).update(`otp-rate:phone:${q}`).digest('hex');
 await db.run('INSERT INTO otp_rate_buckets(key,events) VALUES (?,?)',[key,JSON.stringify(Array(10).fill(Date.now()-20*60000))]);
 await assert.rejects(otpRateLimit(q,'hour-test'),e=>e.status===429);
});
test('concurrent requests issue only one current challenge',async()=>{
 const p=mobile(),r=await Promise.all([send(p),send(p)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,429]);
});
