// Real production OTP route and database behavior; only external SMS transport is simulated.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
Object.assign(process.env,{NODE_ENV:'production',APP_ENV:'local_dev',OPD_DEMO_OTP:'false',OTP_DELIVERY_PROVIDER:'webhook',JWT_SECRET:crypto.randomBytes(32).toString('hex'),DB_DIALECT:'sqlite',SQLITE_PATH:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cc-otp-prod-')),'test.db'),SMS_WEBHOOK_URL:'https://sms.invalid/otp',SMS_WEBHOOK_TOKEN:crypto.randomBytes(32).toString('hex')});
// Deliberately mount route without production boot: production boot requires PostgreSQL.
const express=require('express'),request=require('supertest'),db=require('../database');
const app=express();app.use(express.json());app.use('/otp',require('./auth.ts').authRouter);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.code||'INTERNAL'}));
after(()=>new Promise((resolve,reject)=>db.db.close(e=>e?reject(e):resolve())));
test('production responses/audit/logs omit OTP; adapter sends HTTPS credentials; failure invalidates challenge',async()=>{
 await db.migrateDatabase();
 const originalFetch=global.fetch,originalLog=console.log,originalWarn=console.warn,originalError=console.error;
 let payload,options;const logs=[];console.log=console.warn=console.error=(...args)=>logs.push(args.join(' '));
 try {
  global.fetch=async(url,opts)=>{assert.equal(String(url),'https://sms.invalid/otp');options=opts;payload=JSON.parse(opts.body);return {ok:true};};
  const response=await request(app).post('/otp/otp/request').send({phone:'+919000000081'});
  assert.equal(response.status,200);assert.equal(response.body.development_code,undefined);assert.match(payload.variables.code,/^\d{6}$/);
  assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+process.env.SMS_WEBHOOK_TOKEN);
  assert.ok(!JSON.stringify(response.body).includes(payload.variables.code));
  const unbound=await request(app).post('/otp/otp/verify').send({phone:'+919000000081',code:payload.variables.code});assert.equal(unbound.status,401);
  const wrongChallenge=await request(app).post('/otp/otp/verify').send({phone:'+919000000081',code:payload.variables.code,challenge_id:'wrong'});assert.equal(wrongChallenge.status,401);
  const audit=await db.all('SELECT * FROM audit_logs');assert.ok(!JSON.stringify(audit).includes(payload.variables.code));assert.ok(!logs.join('\n').includes(payload.variables.code));
  global.fetch=async()=>{throw Error('provider secret internal detail');};
  const failed=await request(app).post('/otp/otp/request').send({phone:'+919000000082'});
  assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.body).includes('internal detail'));
  assert.equal((await db.get("SELECT consumed FROM patient_otps WHERE phone='+919000000082'")).consumed,1);
 } finally {global.fetch=originalFetch;console.log=originalLog;console.warn=originalWarn;console.error=originalError;}
});
