const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cohort-'));
const postgres = process.env.OPD_TEST_POSTGRES === 'true';
if (postgres && (!/^cc_validation_[a-f0-9]{32}$/.test(process.env.CC_ISOLATED_TEST_DB || '') || new URL(process.env.DATABASE_URL).pathname !== '/' + process.env.CC_ISOLATED_TEST_DB)) throw Error('Isolated PostgreSQL required');
Object.assign(process.env, {
  NODE_ENV: 'test', APP_ENV: 'local_dev', OPD_DEMO_OTP: 'true', OPD_OG_PILOT_ONLY: 'false',
  ENABLE_LEGACY_API: 'false', OPD_NOTIFICATION_WORKER: 'false', JWT_SECRET: 'SyntheticCohortRegression2026Only',
  PILOT_DOCTOR_ID: 'trial_doc', PILOT_PATIENT_LIMIT: '25',
  ...(!postgres ? { DB_DIALECT: 'sqlite', SQLITE_PATH: path.join(root, 'cohort.db') } : {})
});
const request = require('supertest'), jwt = require('jsonwebtoken');
const app = require('../server'), database = require('../database');
const { createSessionCredentials } = require('../middleware/auth');
const tokens = {};
let department;
const api = (who, method, url, body) => request(app)[method]('/api/v1/opd' + url).auth(tokens[who], { type: 'bearer' }).send(body);
const profile = n => ({ name: `Synthetic trial ${n}`, phone: '+919000001' + String(n).padStart(3, '0'), dob: '1990-06-15', gender: 'Female', address: 'Synthetic address', city: 'Chennai', state: 'Tamil Nadu', pin_code: '600001', emergency_contact: '9000000099' });
before(async () => {
  await database.migrateDatabase();
  department = await database.get("SELECT * FROM departments WHERE prefix='OBST'");
  for (const [id, role] of [['admin', 'ADMIN'], ['trial_doc', 'DOCTOR'], ['other_doc', 'DOCTOR']]) {
    await database.run('INSERT INTO users(id,name,role,department,is_active,must_change_password) VALUES (?,?,?,?,1,0)', [id, 'Synthetic ' + id, role, department.name]);
    const session = createSessionCredentials();
    await database.run("INSERT INTO refresh_tokens(id,session_key,user_id,expires_at,revoked,account_type) VALUES (?,?,?,?,0,'STAFF')", [session.tokenHash, session.sessionKey, id, new Date(Date.now() + 3600000).toISOString()]);
    tokens[id] = jwt.sign({ id, role, account_type: 'STAFF', sid: session.sessionKey }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
});
after(async () => {
  if (database.pgPool) await database.pgPool.end(); else await new Promise(resolve => database.db.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});
test('another doctor cannot access the trial and the directory contains only its named doctor', async () => {
  assert.equal((await api('other_doc', 'get', '/patients')).status, 403);
  const directory = await api('admin', 'get', '/directory');
  assert.equal(directory.status, 200);
  assert.deepEqual(directory.body.doctors.map(d => d.id), ['trial_doc']);
});
test('staff administration cannot add, promote or enable a different doctor', async () => {
  const staff = { id: 'new_doctor', name: 'Synthetic new doctor', role: 'DOCTOR', department: department.name, password: 'SyntheticOnly2026!' };
  assert.equal((await api('admin', 'post', '/staff', staff)).status, 403);
  assert.equal((await api('admin', 'put', '/staff/other_doc', staff)).status, 403);
  assert.equal((await api('admin', 'patch', '/staff/other_doc', { active: true })).status, 403);
  assert.equal((await api('admin', 'post', '/patients', { ...profile(99), assigned_doctor_id: 'other_doc' })).status, 403);
});
test('the final patient place is transactionally reserved and the 26th registration is rejected', async () => {
  for (let n = 1; n <= 24; n++) {
    const created = await api(n === 1 ? 'admin' : 'trial_doc', 'post', '/patients', profile(n));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.assigned_doctor_id, 'trial_doc');
  }
  const responses = await Promise.all([25, 26].map(n => api('trial_doc', 'post', '/patients', profile(n))));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(responses.find(r => r.status === 409).body.error.code, 'PILOT_PATIENT_LIMIT');
  assert.equal(Number((await database.get('SELECT COUNT(*) AS n FROM patients')).n), 25);
});
