/**
 * backend/test.js — In-process supertest harness
 *
 * These tests run the Express app in-process via supertest and seed the local
 * SQLite database directly before verification begins.
 */

process.env.ALLOW_SEED_RESET = 'true';
process.env.ACTIVATION_OTP_DELIVERY = 'api_response';

const assert = require('assert');
const request = require('supertest');
const app = require('./server');
const { resetAndSeedDatabase, get } = require('./database');
const { SEEDED_PASSWORD } = require('./seed');

function pass(label, detail) {
  console.log(`  ✓ PASS — ${label}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function toCount(row) {
  return Number(row?.count || row?.['COUNT(*)'] || 0);
}

async function findAuditCount(action) {
  return get(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = ?`, [action]);
}

async function login(username, password, agent = request(app)) {
  return agent
    .post('/api/v1/auth/login')
    .send({ username, password });
}

async function runVerification() {
  console.log('--- STARTING SUPERTEST IN-PROCESS BACKEND VERIFICATION ---\n');

  console.log('[SETUP] Seeding database...');
  await resetAndSeedDatabase();
  console.log('[SETUP] Done.\n');

  // ────────────────────────────────────────────────────────────────────────
  // Section 1: Platform health and security headers
  // ────────────────────────────────────────────────────────────────────────
  console.log('[1] Health & Headers\n');

  const healthRes = await request(app).get('/api/v1/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200.');
  assert.strictEqual(healthRes.body.status, 'ok', 'Health endpoint must return status=ok.');
  assert.strictEqual(healthRes.headers['x-content-type-options'], 'nosniff', 'Helmet should set nosniff.');
  pass('Health endpoint returns 200 + ok + security headers');

  const oldHealthRes = await request(app).get('/api/health');
  assert.strictEqual(oldHealthRes.status, 404, 'Old /api/health path must not resolve.');
  pass('Old /api/health path remains unavailable');

  const refreshTokensTable = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'`
  );
  assert.ok(refreshTokensTable, 'refresh_tokens table must exist.');
  pass('refresh_tokens table exists');

  const revokedTokensTable = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='revoked_tokens'`
  );
  assert.ok(revokedTokensTable, 'revoked_tokens table must exist.');
  pass('revoked_tokens table exists');

  // ────────────────────────────────────────────────────────────────────────
  // Section 2: Auth/session hardening
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[2] Auth & Session\n');

  const doctorAgent = request.agent(app);

  const unknownLogin = await doctorAgent
    .post('/api/v1/auth/login')
    .send({ username: 'sneaky_hacker', password: 'anything' });
  assert.strictEqual(unknownLogin.status, 401, 'Unknown user login must fail.');
  pass('Unknown user login rejected with 401');

  const unknownLoginAudit = await findAuditCount('SYS_AUTH_DENIAL:UNKNOWN_USER');
  assert.ok(toCount(unknownLoginAudit) >= 1, 'Unknown user login must write audit.');
  pass('Unknown user login writes audit');

  const doctorLogin = await login('doc1_qa', SEEDED_PASSWORD, doctorAgent);
  assert.strictEqual(doctorLogin.status, 200, 'Doctor login must succeed.');
  assert.ok(doctorLogin.body.access_token, 'Doctor login must return access token.');
  assert.ok(
    (doctorLogin.headers['set-cookie'] || []).some((cookie) => cookie.startsWith('cc_refresh_token=')),
    'Doctor login must set httpOnly refresh cookie.'
  );
  const doctorToken = doctorLogin.body.access_token;
  pass('Doctor login sets refresh cookie and returns access token');

  const refreshRes = await doctorAgent.post('/api/v1/auth/refresh').send({});
  assert.strictEqual(refreshRes.status, 200, 'Refresh must succeed with cookie only.');
  assert.ok(refreshRes.body.access_token, 'Refresh must return a new access token.');
  assert.ok(
    (refreshRes.headers['set-cookie'] || []).some((cookie) => cookie.startsWith('cc_refresh_token=')),
    'Refresh must rotate refresh cookie.'
  );
  pass('Refresh works via httpOnly cookie and rotates the cookie');

  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${refreshRes.body.access_token}`);
  assert.strictEqual(meRes.status, 200, '/auth/me must succeed with bearer token.');
  assert.strictEqual(meRes.body.id, 'doc1_qa', '/auth/me must return the correct user.');
  pass('/auth/me succeeds with refreshed access token');

  const sseAccessTokenRes = await request(app)
    .get(`/api/v1/sse?token=${encodeURIComponent(doctorToken)}`);
  assert.strictEqual(sseAccessTokenRes.status, 401, 'Main access token must not be accepted on SSE route.');
  pass('SSE rejects normal access tokens and requires a purpose-limited token');

  const sseTokenRes = await request(app)
    .get('/api/v1/auth/sse-token')
    .set('Authorization', `Bearer ${doctorToken}`);
  assert.strictEqual(sseTokenRes.status, 200, 'Staff should be able to mint SSE tokens.');
  assert.ok(sseTokenRes.body.token, 'SSE token route must return a token.');
  pass('Staff can mint short-lived SSE token');

  const logoutRes = await doctorAgent.post('/api/v1/auth/logout').send({});
  assert.strictEqual(logoutRes.status, 200, 'Logout must succeed.');
  pass('Logout succeeds and clears refresh cookie server-side');

  const revokedRefresh = await doctorAgent.post('/api/v1/auth/refresh').send({});
  assert.strictEqual(revokedRefresh.status, 401, 'Refresh after logout must fail.');
  pass('Refresh cookie is revoked after logout');

  const doctorLoginAudit = await findAuditCount('SYS_AUTH_LOGIN:DOCTOR');
  assert.ok(toCount(doctorLoginAudit) >= 1, 'Doctor login must write audit.');
  pass('Doctor login writes audit');

  // ────────────────────────────────────────────────────────────────────────
  // Section 3: Real role tokens
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[3] Role Tokens\n');

  const nurseLogin = await login('nurse_qa', SEEDED_PASSWORD);
  const adminLogin = await login('admin_qa', SEEDED_PASSWORD);
  const patientLogin = await login('pat-1', SEEDED_PASSWORD);

  assert.strictEqual(nurseLogin.status, 200, 'Nurse login must succeed.');
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed.');
  assert.strictEqual(patientLogin.status, 200, 'Patient login by UHID must succeed.');

  const nurseToken = nurseLogin.body.access_token;
  const adminToken = adminLogin.body.access_token;
  const patientToken = patientLogin.body.access_token;

  pass('Nurse, admin, and patient role logins succeed');

  // ────────────────────────────────────────────────────────────────────────
  // Section 4: RBAC boundaries
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[4] RBAC Boundaries\n');

  const nurseNoteRes = await request(app)
    .post('/api/v1/notes')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ patientId: 'pat-1' });
  assert.strictEqual(nurseNoteRes.status, 403, 'Nurse must not create notes.');
  pass('Nurse denied doctor-only note creation');

  const doctorAdminRes = await request(app)
    .get('/api/v1/admin/users')
    .set('Authorization', `Bearer ${doctorToken}`);
  assert.strictEqual(doctorAdminRes.status, 403, 'Doctor must not access admin user list.');
  pass('Doctor denied admin-only route');

  const adminPatientPortalRes = await request(app)
    .get('/api/v1/my/appointments')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(adminPatientPortalRes.status, 403, 'Admin must not access patient portal routes.');
  pass('Admin denied patient-only portal route');

  const patientNotificationsRes = await request(app)
    .get('/api/v1/notifications')
    .set('Authorization', `Bearer ${patientToken}`);
  assert.strictEqual(patientNotificationsRes.status, 403, 'Patient must not access staff notifications.');
  pass('Patient denied staff notifications route');

  const patientSseTokenRes = await request(app)
    .get('/api/v1/auth/sse-token')
    .set('Authorization', `Bearer ${patientToken}`);
  assert.strictEqual(patientSseTokenRes.status, 403, 'Patient must not mint staff SSE tokens.');
  pass('Patient denied SSE token route');

  const patientNoteRes = await request(app)
    .get('/api/v1/notes/note-1')
    .set('Authorization', `Bearer ${patientToken}`);
  assert.strictEqual(patientNoteRes.status, 403, 'Patient must not access staff clinical note route.');
  pass('Patient denied staff clinical route');

  const staffNotificationsRes = await request(app)
    .get('/api/v1/notifications')
    .set('Authorization', `Bearer ${nurseToken}`);
  assert.strictEqual(staffNotificationsRes.status, 200, 'Staff must retain notifications access.');
  pass('Staff retain notifications access');

  // ────────────────────────────────────────────────────────────────────────
  // Section 5: Abuse protection
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[5] Abuse Protection\n');

  let generateLimiterHit = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await request(app)
      .post('/api/v1/activation/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient_id: 'pat-3' });
    if (attempt < 6) {
      assert.strictEqual(res.status, 200, `Activation generate attempt ${attempt} should still pass.`);
    } else {
      generateLimiterHit = res;
    }
  }
  assert.ok(generateLimiterHit, 'Generate limiter response must exist.');
  assert.strictEqual(generateLimiterHit.status, 429, 'Activation generate must rate limit on the 6th attempt.');
  pass('Activation generate rate limiter triggers on repeated abuse');

  let claimLimiterHit = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await request(app)
      .post('/api/v1/activation/claim')
      .send({ patient_id: 'pat-2', otp: '000000', new_password: 'Password123!' });
    if (attempt < 6) {
      assert.strictEqual(res.status, 401, `Activation claim attempt ${attempt} should fail with 401.`);
    } else {
      claimLimiterHit = res;
    }
  }
  assert.ok(claimLimiterHit, 'Claim limiter response must exist.');
  assert.strictEqual(claimLimiterHit.status, 429, 'Activation claim must rate limit on the 6th attempt.');
  pass('Activation claim rate limiter triggers on repeated abuse');

  // ────────────────────────────────────────────────────────────────────────
  // Section 6: Audit trail coverage
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[6] Audit Trail\n');

  const patientRegisterRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ id: 'pat-10', name: 'Pilot Patient', dob: '1988-06-11', gender: 'Female' });
  assert.strictEqual(patientRegisterRes.status, 201, 'Admin patient onboarding must succeed.');
  pass('Admin patient onboarding succeeds');

  const patientRegisterAudit = await get(
    `SELECT action, patient_id, new_state
     FROM audit_logs
     WHERE patient_id = 'pat-10' AND action LIKE 'PATIENT_REGISTER:%'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(patientRegisterAudit, 'Patient onboarding must write audit.');
  assert.ok(patientRegisterAudit.new_state, 'Patient onboarding audit must include context.');
  pass('Patient onboarding writes contextual audit record');

  const activationAudit = await get(
    `SELECT action, patient_id, new_state
     FROM audit_logs
     WHERE patient_id = 'pat-3' AND action = 'PATIENT_ACTIVATION_OTP_GENERATED'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(activationAudit, 'Activation generation must write audit.');
  assert.ok(activationAudit.new_state, 'Activation generation audit must include context.');
  pass('Activation generation writes contextual audit record');

  const createUserRes = await request(app)
    .post('/api/v1/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ id: 'doc3_qa', role: 'DOCTOR', name: 'Dr. Three', password: 'Password123!' });
  assert.strictEqual(createUserRes.status, 201, 'Admin user creation must succeed.');
  pass('Admin user creation succeeds');

  const createUserAudit = await get(
    `SELECT action, new_state
     FROM audit_logs
     WHERE action LIKE 'ADMIN_USER_CREATE:doc3_qa:%'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(createUserAudit, 'Admin user creation must write audit.');
  assert.ok(createUserAudit.new_state, 'Admin user creation audit must include context.');
  pass('Admin user creation writes contextual audit record');

  const noteCreateRes = await request(app)
    .post('/api/v1/notes')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ patientId: 'pat-2', draft_content: 'Pilot note' });
  assert.strictEqual(noteCreateRes.status, 200, 'Doctor note creation must succeed.');
  pass('Doctor note creation succeeds');

  const noteCreateAudit = await get(
    `SELECT action, patient_id, new_state
     FROM audit_logs
     WHERE action = ?`,
    [`NOTE_CREATE:${noteCreateRes.body.noteId}`]
  );
  assert.ok(noteCreateAudit, 'Note creation must write audit.');
  assert.strictEqual(noteCreateAudit.patient_id, 'pat-2', 'Note creation audit must target the patient.');
  assert.ok(noteCreateAudit.new_state, 'Note creation audit must include context.');
  pass('Note creation writes contextual audit record');

  console.log('\n--- ALL IN-PROCESS VERIFICATION TESTS PASSED ---');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n❌ FAIL:', err.message || err);
  process.exit(1);
});
