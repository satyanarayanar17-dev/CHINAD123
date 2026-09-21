// Must be launched by the disposable PostgreSQL runner.
const {spawnSync}=require('node:child_process');
if(!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB||'') || new URL(process.env.DATABASE_URL).pathname!=='/'+process.env.CC_ISOLATED_TEST_DB)throw Error('Isolated PostgreSQL database required');
Object.assign(process.env,{PORT:'3011',OPD_DEMO_OTP:'true',ENABLE_LEGACY_API:'false'});
const seeded=spawnSync(process.execPath,['backend/opd/demo.cjs'],{env:process.env,stdio:'inherit'});
if(seeded.status!==0)process.exit(seeded.status||1);
const app=require('../backend/server');
app.listen(3011,'127.0.0.1',()=>console.log('Isolated native fixture ready on 3011'));
