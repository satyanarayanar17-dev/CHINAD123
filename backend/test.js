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
const { resetAndSeedDatabase, get, run, all, dbDialect } = require('./database');
const { SEEDED_PASSWORD } = require('./seed');
const { scanDataIntegrity, repairData } = require('./lib/dataIntegrityAudit');

function pass(label, detail) {
  console.log(`  ✓ PASS — ${label}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function toCount(row) {
  return Number(row?.count || row?.['COUNT(*)'] || 0);
}

async function findAuditCount(action) {
  return get(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = ?`, [action]);
}

async function loginStaff(username, password, agent = request(app), ipKey = `staff-${username}`) {
  return agent
    .post('/api/v1/auth/login/staff')
    .set('X-Forwarded-For', ipKey)
    .send({ username, password });
}

async function loginPatient(username, password, agent = request(app), ipKey = `patient-${username}`) {
  return agent
    .post('/api/v1/auth/login/patient')
    .set('X-Forwarded-For', ipKey)
    .send({ username, password });
}

async function corruptDataForIntegrityScenario() {
  const sqliteTriggers = [
    'trg_patients_validate_insert',
    'trg_patients_validate_update',
    'trg_encounters_validate_insert',
    'trg_encounters_validate_update',
    'trg_clinical_notes_validate_insert',
    'trg_clinical_notes_validate_update',
    'trg_prescriptions_validate_insert',
    'trg_prescriptions_validate_update'
  ];

  if (dbDialect === 'sqlite') {
    for (const trigger of sqliteTriggers) {
      await run(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    await run(`PRAGMA foreign_keys = OFF`);
  }

  await run(`UPDATE patients SET name = '', gender = 'Alien' WHERE id = ?`, ['pat-3']);
  await run(
    `INSERT INTO encounters (id, patient_id, phase, lifecycle_status, is_discharged, __v)
     VALUES (?, ?, ?, ?, 0, 1)`,
    ['enc-orphan', 'ghost-patient', 'RECEPTION', 'RECEPTION']
  );
  await run(
    `INSERT INTO encounters (id, patient_id, phase, lifecycle_status, is_discharged, __v)
     VALUES (?, ?, ?, ?, 0, 1)`,
    ['enc-legacy-closed', 'pat-2', 'CLOSED', 'CLOSED']
  );
  await run(
    `INSERT INTO encounters (id, patient_id, phase, lifecycle_status, is_discharged, __v)
     VALUES (?, ?, ?, ?, 0, 1)`,
    ['enc-ambiguous', 'pat-2', 'MYSTERY', 'MYSTERY']
  );
  await run(
    `INSERT INTO clinical_notes (id, encounter_id, draft_content, status, author_id, __v)
     VALUES (?, ?, ?, ?, ?, 1)`,
    ['note-orphan', 'enc-orphan', 'orphaned note', 'DRAFT', 'doc1_qa']
  );
  await run(
    `INSERT INTO clinical_notes (id, encounter_id, draft_content, status, author_id, __v)
     VALUES (?, ?, ?, ?, ?, 1)`,
    ['note-lower', 'enc-2', 'legacy lowercase note', 'finalized', 'doc1_qa']
  );
  await run(
    `INSERT INTO prescriptions (id, encounter_id, rx_content, status, authorizing_user_id, __v)
     VALUES (?, ?, ?, ?, ?, 1)`,
    ['rx-invalid', 'enc-2', 'legacy invalid status', 'WRITTEN', null]
  );

  if (dbDialect === 'sqlite') {
    await run(`PRAGMA foreign_keys = ON`);
  }
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
  const patientAgent = request.agent(app);

  const unknownLogin = await doctorAgent
    .post('/api/v1/auth/login/patient')
    .set('X-Forwarded-For', 'patient-unknown-user')
    .send({ username: 'sneaky_hacker', password: 'anything' });
  assert.strictEqual(unknownLogin.status, 401, 'Unknown user login must fail.');
  pass('Unknown user login rejected with 401');

  const missingAccountType = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', 'generic-missing-account-type')
    .send({ username: 'doc1_qa', password: SEEDED_PASSWORD });
  assert.strictEqual(missingAccountType.status, 400, 'Generic login must require an explicit account type.');
  assert.strictEqual(
    missingAccountType.body.error.code,
    'ACCOUNT_TYPE_REQUIRED',
    'Generic login must return a stable account type error code.'
  );
  pass('Generic login path rejects requests without account_type');

  const unknownLoginAudit = await findAuditCount('SYS_AUTH_DENIAL:UNKNOWN_USER');
  assert.ok(toCount(unknownLoginAudit) >= 1, 'Unknown user login must write audit.');
  pass('Unknown user login writes audit');

  const doctorViaPatientLogin = await loginPatient('doc1_qa', SEEDED_PASSWORD);
  assert.strictEqual(doctorViaPatientLogin.status, 403, 'Doctor credentials must be rejected on patient login.');
  assert.strictEqual(doctorViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Doctor patient-login rejection must be explicit.');
  pass('Doctor credentials are rejected by the patient login path');

  const nurseViaPatientLogin = await loginPatient('nurse_qa', SEEDED_PASSWORD);
  assert.strictEqual(nurseViaPatientLogin.status, 403, 'Nurse credentials must be rejected on patient login.');
  assert.strictEqual(nurseViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Nurse patient-login rejection must be explicit.');
  pass('Nurse credentials are rejected by the patient login path');

  const adminViaPatientLogin = await loginPatient('admin_qa', SEEDED_PASSWORD);
  assert.strictEqual(adminViaPatientLogin.status, 403, 'Admin credentials must be rejected on patient login.');
  assert.strictEqual(adminViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Admin patient-login rejection must be explicit.');
  pass('Admin credentials are rejected by the patient login path');

  const patientViaStaffLogin = await loginStaff('pat-1', SEEDED_PASSWORD);
  assert.strictEqual(patientViaStaffLogin.status, 403, 'Patient credentials must be rejected on staff login.');
  assert.strictEqual(patientViaStaffLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Patient staff-login rejection must be explicit.');
  pass('Patient credentials are rejected by the staff login path');

  const doctorLogin = await loginStaff('doc1_qa', SEEDED_PASSWORD, doctorAgent);
  assert.strictEqual(doctorLogin.status, 200, 'Doctor login must succeed.');
  assert.ok(doctorLogin.body.access_token, 'Doctor login must return access token.');
  assert.strictEqual(doctorLogin.body.account_type, 'staff', 'Doctor login must return the staff account type.');
  assert.ok(
    (doctorLogin.headers['set-cookie'] || []).some((cookie) => cookie.startsWith('cc_refresh_token=')),
    'Doctor login must set httpOnly refresh cookie.'
  );
  const doctorToken = doctorLogin.body.access_token;
  pass('Doctor login sets refresh cookie and returns access token');

  const refreshRes = await doctorAgent.post('/api/v1/auth/refresh').send({});
  assert.strictEqual(refreshRes.status, 200, 'Refresh must succeed with cookie only.');
  assert.ok(refreshRes.body.access_token, 'Refresh must return a new access token.');
  assert.strictEqual(refreshRes.body.role, 'doctor', 'Refresh must preserve the doctor role.');
  assert.strictEqual(refreshRes.body.account_type, 'staff', 'Refresh must preserve the staff account type.');
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
  assert.strictEqual(meRes.body.role, 'doctor', '/auth/me must preserve the doctor role.');
  assert.strictEqual(meRes.body.account_type, 'staff', '/auth/me must preserve the staff account type.');
  pass('/auth/me succeeds with refreshed access token');

  const patientLogin = await loginPatient('pat-1', SEEDED_PASSWORD, patientAgent);
  assert.strictEqual(patientLogin.status, 200, 'Patient login must succeed on the patient login path.');
  assert.strictEqual(patientLogin.body.account_type, 'patient', 'Patient login must return the patient account type.');

  const patientRefreshRes = await patientAgent.post('/api/v1/auth/refresh').send({});
  assert.strictEqual(patientRefreshRes.status, 200, 'Patient refresh must succeed with cookie only.');
  assert.strictEqual(patientRefreshRes.body.role, 'patient', 'Patient refresh must preserve the patient role.');
  assert.strictEqual(patientRefreshRes.body.account_type, 'patient', 'Patient refresh must preserve the patient account type.');

  const patientMeRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${patientRefreshRes.body.access_token}`);
  assert.strictEqual(patientMeRes.status, 200, 'Patient /auth/me must succeed with refreshed bearer token.');
  assert.strictEqual(patientMeRes.body.role, 'patient', 'Patient /auth/me must preserve the patient role.');
  assert.strictEqual(patientMeRes.body.account_type, 'patient', 'Patient /auth/me must preserve the patient account type.');
  pass('Patient refresh preserves patient role and account type');

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

  const nurseLogin = await loginStaff('nurse_qa', SEEDED_PASSWORD);
  const adminLogin = await loginStaff('admin_qa', SEEDED_PASSWORD);
  const patientPortalLogin = await loginPatient('pat-1', SEEDED_PASSWORD);

  assert.strictEqual(nurseLogin.status, 200, 'Nurse login must succeed.');
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed.');
  assert.strictEqual(patientPortalLogin.status, 200, 'Patient login by UHID must succeed.');

  const nurseToken = nurseLogin.body.access_token;
  const adminToken = adminLogin.body.access_token;
  const patientToken = patientPortalLogin.body.access_token;

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

  const doctorPatientPortalRes = await request(app)
    .get('/api/v1/my/appointments')
    .set('Authorization', `Bearer ${doctorToken}`);
  assert.strictEqual(doctorPatientPortalRes.status, 403, 'Doctor must not access patient portal routes.');
  pass('Doctor denied patient-only portal route');

  const nursePatientPortalRes = await request(app)
    .get('/api/v1/my/appointments')
    .set('Authorization', `Bearer ${nurseToken}`);
  assert.strictEqual(nursePatientPortalRes.status, 403, 'Nurse must not access patient portal routes.');
  pass('Nurse denied patient-only portal route');

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

  const atomicOnboardingRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      id: 'pat-11',
      name: 'Activation Ready Patient',
      dob: '1991-04-05',
      gender: 'Female',
      issueActivationToken: true
    });
  assert.strictEqual(atomicOnboardingRes.status, 201, 'Atomic onboarding with activation token must succeed.');
  assert.ok(atomicOnboardingRes.body.encounterId, 'Atomic onboarding must guarantee an active encounter.');
  assert.strictEqual(atomicOnboardingRes.body.activationPath, '/patient/activate', 'Atomic onboarding must return the activation route.');
  assert.ok(
    atomicOnboardingRes.body.activation?.activation_code,
    'Atomic onboarding must surface the activation code in API delivery mode.'
  );
  const activationClaimRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      patient_id: 'pat-11',
      otp: atomicOnboardingRes.body.activation.activation_code,
      new_password: 'Password123!'
    });
  assert.strictEqual(activationClaimRes.status, 200, 'Atomic onboarding activation code must be claimable.');
  pass('Atomic onboarding flows cleanly from patient creation to activation claim');

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

  // ────────────────────────────────────────────────────────────────────────
  // Section 7: Data integrity guards
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n[7] Data Integrity\n');

  const invalidPatientPayloadRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ id: 'pat-bad', name: 'Broken Patient', dob: 'not-a-date', gender: 'Alien' });
  assert.strictEqual(invalidPatientPayloadRes.status, 400, 'Invalid patient demographics must be rejected.');
  assert.strictEqual(
    invalidPatientPayloadRes.body.error.code,
    'INVALID_PATIENT_PAYLOAD',
    'Invalid patient payload should return a stable integrity error code.'
  );
  pass('Invalid patient onboarding payload is rejected');

  const invalidQueuePhaseRes = await request(app)
    .patch('/api/v1/queue/enc-1')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ phase: 'DISCHARGED', version: 1 });
  assert.strictEqual(invalidQueuePhaseRes.status, 422, 'Queue route must reject discharge-style phase writes.');
  assert.strictEqual(
    invalidQueuePhaseRes.body.error.code,
    'INVALID_QUEUE_PHASE',
    'Queue phase rejection should use a stable error code.'
  );
  pass('Queue route rejects invalid lifecycle transitions');

  await corruptDataForIntegrityScenario();

  const integrityScan = await scanDataIntegrity({ all });
  assert.ok(integrityScan.counts.invalidPatients >= 1, 'Corrupt patient rows must be detected.');
  assert.ok(integrityScan.counts.invalidEncounters >= 3, 'Corrupt encounter rows must be detected.');
  assert.ok(integrityScan.counts.malformedQueueRows >= 3, 'Malformed active queue rows must be detected.');
  assert.ok(integrityScan.counts.invalidNotes >= 1, 'Corrupt note rows must be detected.');
  assert.ok(integrityScan.counts.invalidPrescriptions >= 1, 'Corrupt prescription rows must be detected.');
  pass('Diagnostics detect corrupt pilot data shapes');

  const queueRes = await request(app)
    .get('/api/v1/queue')
    .set('Authorization', `Bearer ${doctorToken}`);
  assert.strictEqual(queueRes.status, 200, 'Queue endpoint must stay available even with corrupt legacy rows.');
  assert.ok(!queueRes.body.some((slot) => slot.id === 'enc-orphan'), 'Orphan encounters must not be emitted to the queue read model.');
  assert.ok(!queueRes.body.some((slot) => slot.id === 'enc-legacy-closed'), 'Legacy closed encounters must not leak into active queue reads.');
  assert.ok(!queueRes.body.some((slot) => slot.id === 'enc-ambiguous'), 'Unknown lifecycle rows must be excluded from queue reads.');
  const placeholderQueueSlot = queueRes.body.find((slot) => slot.id === 'enc-3');
  assert.ok(placeholderQueueSlot, 'Existing valid encounter should remain visible in queue.');
  assert.strictEqual(
    placeholderQueueSlot.patient.name,
    'Unknown Patient (pat-3)',
    'Queue serializer must apply a deterministic placeholder when patient name is blank.'
  );
  pass('Queue endpoint skips malformed rows and normalizes blank patient names');

  const repairDryRun = await repairData(
    { all, run, dialect: dbDialect },
    { dryRun: true }
  );
  assert.ok(repairDryRun.repaired.some((entry) => entry.table === 'patients' && entry.id === 'pat-3'), 'Dry-run repair should plan patient demographic fixes.');
  assert.ok(repairDryRun.quarantined.some((entry) => entry.table === 'encounters' && entry.id === 'enc-orphan'), 'Dry-run repair should plan orphan encounter quarantine.');
  assert.ok(repairDryRun.quarantined.some((entry) => entry.table === 'prescriptions' && entry.id === 'rx-invalid'), 'Dry-run repair should plan invalid prescription quarantine.');
  assert.ok(repairDryRun.manualReview.some((entry) => entry.table === 'encounters' && entry.id === 'enc-ambiguous'), 'Dry-run repair must leave unsafe ambiguous rows for manual review.');
  pass('Repair dry-run reports deterministic actions without mutating data');

  const repairApply = await repairData(
    { all, run, dialect: dbDialect },
    { dryRun: false }
  );
  assert.ok(repairApply.quarantined.some((entry) => entry.table === 'encounters' && entry.id === 'enc-orphan'), 'Apply repair must quarantine orphan encounters.');
  assert.ok(repairApply.manualReview.some((entry) => entry.table === 'encounters' && entry.id === 'enc-ambiguous'), 'Apply repair must preserve explicit manual review items.');

  const repairedPatient = await get(`SELECT name, gender FROM patients WHERE id = ?`, ['pat-3']);
  assert.strictEqual(repairedPatient.name, 'Unknown Patient (pat-3)', 'Repair must fill deterministic placeholder names.');
  assert.strictEqual(repairedPatient.gender, 'Not specified', 'Repair must normalize invalid genders.');

  const repairedEncounter = await get(`SELECT phase, is_discharged FROM encounters WHERE id = ?`, ['enc-legacy-closed']);
  assert.strictEqual(repairedEncounter.phase, 'DISCHARGED', 'Legacy closed encounters must normalize to DISCHARGED.');
  assert.strictEqual(repairedEncounter.is_discharged, 1, 'Legacy closed encounters must become discharged.');

  const normalizedNote = await get(`SELECT status FROM clinical_notes WHERE id = ?`, ['note-lower']);
  assert.strictEqual(normalizedNote.status, 'FINALIZED', 'Repair must normalize lowercase note statuses.');

  const orphanEncounter = await get(`SELECT id FROM encounters WHERE id = ?`, ['enc-orphan']);
  assert.strictEqual(orphanEncounter, undefined, 'Quarantined orphan encounters must be removed from live tables.');

  const invalidPrescription = await get(`SELECT id FROM prescriptions WHERE id = ?`, ['rx-invalid']);
  assert.strictEqual(invalidPrescription, undefined, 'Unrepairable prescription rows must be removed from live tables after quarantine.');

  const quarantineRows = await all(
    `SELECT source_table, source_id, reason
     FROM data_integrity_quarantine
     WHERE source_id IN ('enc-orphan', 'note-orphan', 'rx-invalid')
     ORDER BY source_table, source_id`
  );
  assert.ok(quarantineRows.length >= 3, 'Repair must snapshot removed rows into quarantine.');

  const postRepairScan = await scanDataIntegrity({ all });
  assert.strictEqual(postRepairScan.counts.invalidPatients, 0, 'Repair must clear fixable patient issues.');
  assert.strictEqual(postRepairScan.counts.invalidNotes, 0, 'Repair must clear fixable note issues.');
  assert.strictEqual(postRepairScan.counts.invalidPrescriptions, 0, 'Repair must clear fixable prescription issues.');
  assert.ok(postRepairScan.invalidEncounters.some((issue) => issue.id === 'enc-ambiguous'), 'Unsafe ambiguous encounter must remain visible for manual review.');
  pass('Repair fixes safe cases, quarantines unusable rows, and preserves explicit manual review items');

  console.log('\n--- ALL IN-PROCESS VERIFICATION TESTS PASSED ---');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('\n❌ FAIL:', err.message || err);
  process.exit(1);
});
