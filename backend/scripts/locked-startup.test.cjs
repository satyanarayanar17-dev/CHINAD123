const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
test('locked pilot boot creates a private encrypted backup and reports ready without demo data',async()=>{
 if(process.env.OPD_TEST_POSTGRES!=='true')throw Error('Run through isolated-postgres.cjs');
 const root=await fs.mkdtemp(path.resolve(__dirname,'../../../locked-startup-'));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,NODE_ENV:'production',APP_ENV:'restricted_web_pilot',PORT:'3012',JWT_SECRET:crypto.randomBytes(32).toString('hex'),CORS_ORIGIN:'https://synthetic-hospital.invalid',COOKIE_SECURE:'true',COOKIE_SAME_SITE:'none',PERSISTENT_DATA_ROOT:root,PATIENT_DOCUMENT_STORAGE_PATH:path.join(root,'documents'),BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),BOOTSTRAP_ADMIN_ID:'startup-admin',BOOTSTRAP_ADMIN_NAME:'Synthetic Startup Administrator',BOOTSTRAP_ADMIN_PASSWORD:crypto.randomBytes(24).toString('base64')+'A1!',OTP_DELIVERY_PROVIDER:'webhook',SMS_WEBHOOK_URL:'https://synthetic-sms.invalid/dispatch',SMS_WEBHOOK_TOKEN:crypto.randomBytes(24).toString('hex'),OPD_DEMO_OTP:'false',OPD_OG_PILOT_ONLY:'true',ENABLE_LEGACY_API:'false',OPD_NOTIFICATION_WORKER:'false',PILOT_AUTH_BYPASS:'false',ALLOW_SEED_RESET:'false'},stdio:['ignore','ignore','ignore']});
 let exited=false;child.once('exit',()=>{exited=true;});
 try{
  let ready;
  for(let attempt=0;attempt<100&&!exited;attempt++){
   try {const response=await fetch('http://127.0.0.1:3012/api/v1/ready');if(response.status===200){ready=await response.json();break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready?.ready,true,'Pilot did not become ready');
  const health=await(await fetch('http://127.0.0.1:3012/api/v1/health')).json();assert.equal(health.boot?.checks?.recovery?.status,'ok');
  const archives=(await fs.readdir(path.join(root,'backups'))).filter(f=>f.endsWith('.ccbackup'));assert.equal(archives.length,1);
  assert.equal((await fs.stat(path.join(root,'backups',archives[0]))).mode&0o777,0o600);
  const config=await(await fetch('http://127.0.0.1:3012/api/v1/auth/opd/config')).json();assert.equal(config.demo_otp,false);
 }finally{child.kill('SIGTERM');if(!exited)await new Promise(resolve=>child.once('exit',resolve));await fs.rm(root,{recursive:true,force:true});}
});
