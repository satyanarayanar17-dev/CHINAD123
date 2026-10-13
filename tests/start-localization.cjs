// Separate disposable API fixture for localization and responsive browser QA.
const {mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const fixture=path.join(mkdtempSync(path.join(tmpdir(),'cc-opd-localization-')),'fixture.db');
Object.assign(process.env,{NODE_ENV:'development',APP_ENV:'local_dev',OPD_DEMO_OTP:'true',DB_DIALECT:'sqlite',SQLITE_PATH:fixture,OPD_DEMO_DB:fixture,PORT:'3004',CORS_ORIGIN:'http://127.0.0.1:5176',JWT_SECRET:''});
const seeded=spawnSync(process.execPath,['backend/opd/demo.cjs'],{env:process.env,encoding:'utf8'});
if(seeded.status!==0){console.error(seeded.stderr,seeded.stdout.slice(-5000));process.exit(1);}
console.log(`Localization fixture ready: ${fixture}`);
const app=require('../backend/server');
app.listen(3004,'127.0.0.1',()=>console.log('Localization API listening on 3004'));
