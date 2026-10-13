// A disposable SQLite fixture protects the deployed pilot's admin-only audit query.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-admin-dashboard-'));
Object.assign(process.env, {
  NODE_ENV: 'test', APP_ENV: 'local_dev', DB_DIALECT: 'sqlite',
  SQLITE_PATH: path.join(root, 'validation.db'), ENABLE_LEGACY_API: 'true',
  OPD_NOTIFICATION_WORKER: 'false', OPD_OG_PILOT_ONLY: 'true',
  JWT_SECRET: 'SyntheticAdminDashboardRegression2026Only'
});
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server');
const database = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

async function run() {
  await database.migrateDatabase();
  const department = await database.get("SELECT * FROM departments WHERE prefix='OBST'");
  for (const [id, role] of [['test-admin','ADMIN'],['test-doctor','DOCTOR'],['test-nurse','NURSE'],['test-patient','PATIENT']]) {
    await database.run('INSERT INTO users (id,name,role,department,is_active,must_change_password) VALUES (?,?,?,?,1,0)', [id, 'Synthetic '+role, role, department.name]);
  }
  const columns = await database.all('PRAGMA table_info(audit_logs)');
  assert.ok(columns.some(column => column.name === 'action'));
  assert.ok(!columns.some(column => column.name === 'code'));
  const recent = new Date().toISOString();
  const old = new Date(Date.now()-48*60*60*1000).toISOString();
  for (const [action, timestamp] of [['BREAK_GLASS_ACCESSED',recent],['BREAK_GLASS_ACCESSED',recent],['BREAK_GLASS_ACCESSED',old],['PATIENT_DIRECTORY_ACCESSED',recent]]) {
    await database.run('INSERT INTO audit_logs (actor_id,action,timestamp) VALUES (?,?,?)', ['test-admin',action,timestamp]);
  }
  for (const [id, role] of [['test-admin','ADMIN'],['test-doctor','DOCTOR'],['test-nurse','NURSE']]) {
    const token=jwt.sign({id,role,account_type:'STAFF'},JWT_SECRET,{expiresIn:'5m'});
    const response=await request(app).get('/api/v1/opd/dashboard').set('Authorization','Bearer '+token);
    assert.equal(response.status,200,role+': '+JSON.stringify(response.body));
    assert.equal(response.body.security_alerts,role==='ADMIN'?2:0);
    assert.equal(response.body.appointments,0);
    assert.ok(Array.isArray(response.body.doctors));
    console.log('PASS '+role+' overview returns valid metrics; recent audit alerts use the action column');
  }
  const patient=jwt.sign({id:'test-patient',role:'PATIENT',account_type:'PATIENT'},JWT_SECRET,{expiresIn:'5m'});
  const rejected=await request(app).get('/api/v1/opd/dashboard').set('Authorization','Bearer '+patient);
  assert.equal(rejected.status,403);
  console.log('PASS patient cannot access staff overview');
}
run().then(()=>process.exitCode=0).catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  await new Promise(resolve=>database.db.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
});
