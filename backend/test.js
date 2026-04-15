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

const SEEDED_PATIENT_PHONES = {
  pat1: '+919876543210',
  pat2: '+919876543211',
  pat3: '+919876543212'
};

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

  const mustChangePasswordColumn = dbDialect === 'postgres'
    ? await get(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'must_change_password'`
      )
    : await get(`SELECT name FROM pragma_table_info('users') WHERE name = 'must_change_password'`);
  assert.ok(mustChangePasswordColumn, 'users.must_change_password must exist after migrations.');
  pass('users.must_change_password migration applied');

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

  const patientViaStaffLogin = await loginStaff(SEEDED_PATIENT_PHONES.pat1, SEEDED_PASSWORD);
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
  assert.strictEqual(meRes.body.must_change_password, false, '/auth/me must expose must_change_password=false for seeded staff.');
  pass('/auth/me succeeds with refreshed access token');

  const patientLogin = await loginPatient(SEEDED_PATIENT_PHONES.pat1, SEEDED_PASSWORD, patientAgent);
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
  assert.strictEqual(patientMeRes.body.must_change_password, false, 'Patient /auth/me must expose must_change_password=false for seeded patients.');
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
  const patientPortalLogin = await loginPatient(SEEDED_PATIENT_PHONES.pat1, SEEDED_PASSWORD);

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
      .send({ phone: SEEDED_PATIENT_PHONES.pat2, otp: '000000', new_password: 'Password123!' });
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
    .send({ name: 'Pilot Patient', phone: '+919876543220', dob: '1988-06-11', gender: 'Female' });
  assert.strictEqual(patientRegisterRes.status, 201, 'Admin patient onboarding must succeed.');
  assert.ok(patientRegisterRes.body.patient?.id, 'Server-generated onboarding must return a patient identifier.');
  assert.strictEqual(patientRegisterRes.body.patient.phone, '+919876543220', 'Patient onboarding must persist the normalized phone number.');
  pass('Admin patient onboarding succeeds');

  const atomicOnboardingRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Activation Ready Patient',
      phone: '+919876543221',
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
      phone: atomicOnboardingRes.body.patient.phone,
      otp: atomicOnboardingRes.body.activation.activation_code,
      new_password: 'Password123!'
    });
  assert.strictEqual(activationClaimRes.status, 200, 'Atomic onboarding activation code must be claimable.');
  pass('Atomic onboarding flows cleanly from patient creation to activation claim');

  const patientRegisterAudit = await get(
    `SELECT action, patient_id, new_state
     FROM audit_logs
     WHERE patient_id = ? AND action LIKE 'PATIENT_REGISTER:%'
     ORDER BY id DESC
     LIMIT 1`,
    [patientRegisterRes.body.patient.id]
  );
  assert.ok(patientRegisterAudit, 'Patient onboarding must write audit.');
  assert.ok(patientRegisterAudit.new_state, 'Patient onboarding audit must include context.');
  pass('Patient onboarding writes contextual audit record');

  const duplicatePhoneRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Conflicting Patient', phone: '+919876543220', dob: '1970-01-01', gender: 'Male' });
  assert.strictEqual(duplicatePhoneRes.status, 409, 'Duplicate patient phone numbers must be rejected.');
  assert.strictEqual(duplicatePhoneRes.body.error.code, 'PHONE_ALREADY_REGISTERED', 'Duplicate phone rejections must use a stable error code.');
  pass('Duplicate patient phone numbers are rejected safely');

  const nurseIntakeRes = await request(app)
    .post('/api/v1/patients')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ name: 'Walk In Patient', dob: '1994-02-10', gender: 'Female' });
  assert.strictEqual(nurseIntakeRes.status, 201, 'Nurse intake should be able to create a fresh patient without a phone number.');
  assert.ok(nurseIntakeRes.body.patient?.id, 'Nurse intake must return a patient identifier.');
  pass('Nurse fresh intake can create a patient record');

  const missingDoctorHandoffRes = await request(app)
    .post('/api/v1/queue/handoff')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({
      patientId: nurseIntakeRes.body.patient.id,
      chiefComplaint: 'Fever for two days',
      triagePriority: 'URGENT',
      vitals: {
        height: 165,
        weight: 62,
        systolic: 128,
        diastolic: 82,
        hr: 96,
        temp: 38,
        spo2: 98
      }
    });
  assert.strictEqual(missingDoctorHandoffRes.status, 400, 'Nurse handoff must reject missing doctor assignment.');
  assert.strictEqual(
    missingDoctorHandoffRes.body.error.code,
    'DOCTOR_SELECTION_REQUIRED',
    'Missing doctor assignment must use a stable validation code.'
  );
  pass('Nurse handoff requires doctor selection before push');

  const handoffRes = await request(app)
    .post('/api/v1/queue/handoff')
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({
      patientId: nurseIntakeRes.body.patient.id,
      doctorId: 'doc1_qa',
      chiefComplaint: 'Fever for two days',
      triagePriority: 'URGENT',
      handoffNotes: 'Family reports reduced oral intake since last night.',
      vitals: {
        height: 165,
        weight: 62,
        systolic: 128,
        diastolic: 82,
        hr: 96,
        temp: 38,
        spo2: 98
      }
    });
  assert.strictEqual(handoffRes.status, 200, 'Nurse handoff with doctor assignment must succeed.');
  assert.strictEqual(handoffRes.body.assignedDoctor.id, 'doc1_qa', 'Handoff response must echo the assigned doctor.');

  const handedOffEncounter = await get(
    `SELECT assigned_doctor_id, chief_complaint, triage_priority, handoff_notes, triage_vitals_json, triaged_by, phase, lifecycle_status
     FROM encounters
     WHERE patient_id = ? AND is_discharged = 0`,
    [nurseIntakeRes.body.patient.id]
  );
  assert.strictEqual(handedOffEncounter.assigned_doctor_id, 'doc1_qa', 'Doctor assignment must persist on the active encounter.');
  assert.strictEqual(handedOffEncounter.chief_complaint, 'Fever for two days', 'Chief complaint must persist on the encounter.');
  assert.strictEqual(handedOffEncounter.triage_priority, 'URGENT', 'Triage priority must persist on the encounter.');
  assert.strictEqual(handedOffEncounter.handoff_notes, 'Family reports reduced oral intake since last night.', 'Handoff notes must persist on the encounter.');
  assert.strictEqual(handedOffEncounter.triaged_by, 'nurse_qa', 'Encounter must record the triaging nurse.');
  assert.strictEqual(handedOffEncounter.phase, 'AWAITING', 'Handoff must move the encounter into the doctor waiting queue.');
  assert.strictEqual(handedOffEncounter.lifecycle_status, 'AWAITING', 'Lifecycle status must match the waiting queue phase after handoff.');
  assert.ok(handedOffEncounter.triage_vitals_json, 'Triage vitals must persist on the encounter.');
  pass('Doctor assignment and triage payload persist on the encounter');

  const doc1QueueRes = await request(app)
    .get('/api/v1/queue')
    .set('Authorization', `Bearer ${doctorToken}`);
  assert.strictEqual(doc1QueueRes.status, 200, 'Assigned doctor queue must load successfully.');
  assert.ok(
    doc1QueueRes.body.some((slot) => slot.patient.id === nurseIntakeRes.body.patient.id && slot.assignedDoctor?.id === 'doc1_qa'),
    'Assigned patient must appear in the chosen doctor queue with doctor metadata.'
  );

  const doctorTwoLogin = await loginStaff('doc2_qa', SEEDED_PASSWORD);
  assert.strictEqual(doctorTwoLogin.status, 200, 'Second doctor login must succeed.');
  const doctorTwoToken = doctorTwoLogin.body.access_token;

  const doc2QueueRes = await request(app)
    .get('/api/v1/queue')
    .set('Authorization', `Bearer ${doctorTwoToken}`);
  assert.strictEqual(doc2QueueRes.status, 200, 'Non-assigned doctor queue must still load successfully.');
  assert.ok(
    !doc2QueueRes.body.some((slot) => slot.patient.id === nurseIntakeRes.body.patient.id),
    'Assigned patient must not leak into another doctor queue.'
  );
  pass('Assigned patient appears only in the selected doctor queue');

  const wrongDoctorNoteRes = await request(app)
    .post('/api/v1/notes')
    .set('Authorization', `Bearer ${doctorTwoToken}`)
    .send({ patientId: nurseIntakeRes.body.patient.id, draft_content: 'Cross-doctor attempt' });
  assert.strictEqual(wrongDoctorNoteRes.status, 403, 'Non-assigned doctor must not be able to draft a note for the handed-off patient.');
  assert.strictEqual(
    wrongDoctorNoteRes.body.error.code,
    'ASSIGNED_DOCTOR_MISMATCH',
    'Wrong-doctor note attempts must fail with the doctor-assignment code.'
  );
  pass('Wrong doctor cannot mutate the assigned patient workflow');

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

  const resetPasswordRes = await request(app)
    .post('/api/v1/admin/users/doc3_qa/reset-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.strictEqual(resetPasswordRes.status, 200, 'Admin password reset must succeed.');
  assert.strictEqual(resetPasswordRes.body.reset, true, 'Password reset must confirm success.');
  assert.strictEqual(resetPasswordRes.body.must_change_password, true, 'Password reset must mark must_change_password.');
  assert.ok(resetPasswordRes.body.temporaryPassword, 'Password reset must return a generated temporary password.');
  assert.ok(resetPasswordRes.body.temporaryPassword.length >= 12, 'Generated temporary password must be non-trivial.');
  pass('Reset-password returns a generated temporary password once');

  const resetUserRow = await get(
    `SELECT must_change_password, password_hash
     FROM users
     WHERE id = ?`,
    ['doc3_qa']
  );
  assert.strictEqual(resetUserRow.must_change_password, 1, 'Reset user must be flagged for password change in the database.');
  assert.ok(resetUserRow.password_hash, 'Reset user must have a stored password hash.');
  pass('Reset-password persists must_change_password in the database');

  const oldPasswordLoginAfterReset = await loginStaff('doc3_qa', 'Password123!');
  assert.strictEqual(oldPasswordLoginAfterReset.status, 401, 'Old password must stop working immediately after admin reset.');
  pass('Old password is invalidated by admin reset');

  const tempPasswordLogin = await loginStaff('doc3_qa', resetPasswordRes.body.temporaryPassword);
  assert.strictEqual(tempPasswordLogin.status, 200, 'Temporary password login must succeed.');
  assert.strictEqual(tempPasswordLogin.body.must_change_password, true, 'Login response must expose must_change_password after admin reset.');
  pass('Login response exposes must_change_password for reset users');

  const tempPasswordToken = tempPasswordLogin.body.access_token;
  const tempPasswordMe = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${tempPasswordToken}`);
  assert.strictEqual(tempPasswordMe.status, 200, '/auth/me must work for a reset user.');
  assert.strictEqual(tempPasswordMe.body.must_change_password, true, '/auth/me must expose must_change_password=true after reset.');
  pass('/auth/me exposes must_change_password for reset users');

  const passwordChangeRes = await request(app)
    .post('/api/v1/auth/change-password')
    .set('Authorization', `Bearer ${tempPasswordToken}`)
    .send({
      currentPassword: resetPasswordRes.body.temporaryPassword,
      newPassword: 'NewPassword123!'
    });
  assert.strictEqual(passwordChangeRes.status, 200, 'Authenticated password change must succeed with the current password.');
  assert.strictEqual(passwordChangeRes.body.success, true, 'Password change must return success JSON.');
  assert.strictEqual(passwordChangeRes.body.must_change_password, false, 'Password change must clear must_change_password in the response.');
  pass('Change-password clears must_change_password');

  const changedPasswordMe = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${tempPasswordToken}`);
  assert.strictEqual(changedPasswordMe.status, 200, '/auth/me must continue working after password change.');
  assert.strictEqual(changedPasswordMe.body.must_change_password, false, '/auth/me must show cleared must_change_password after password change.');
  pass('/auth/me reflects cleared must_change_password after password change');

  const changedUserRow = await get(
    `SELECT must_change_password
     FROM users
     WHERE id = ?`,
    ['doc3_qa']
  );
  assert.strictEqual(changedUserRow.must_change_password, 0, 'Password change must clear the database flag.');
  pass('Database flag is cleared after password change');

  const loginWithNewPassword = await loginStaff('doc3_qa', 'NewPassword123!');
  assert.strictEqual(loginWithNewPassword.status, 200, 'User must be able to log in with the new password.');
  assert.strictEqual(loginWithNewPassword.body.must_change_password, false, 'must_change_password should stay cleared on subsequent logins.');
  pass('User can log in normally after changing the temporary password');

  const resetAudit = await get(
    `SELECT action
     FROM audit_logs
     WHERE action LIKE 'ADMIN_PASS_RESET:doc3_qa:%'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(resetAudit, 'Reset-password must preserve audit logging.');

  const changePasswordAudit = await get(
    `SELECT action
     FROM audit_logs
     WHERE actor_id = 'doc3_qa' AND action = 'SYS_AUTH_PASSWORD_CHANGE:DOCTOR'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(changePasswordAudit, 'Change-password must write an audit record.');
  pass('Password reset and password change both write audit records');

  const rxCreateRes = await request(app)
    .post('/api/v1/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientId: 'pat-2',
      rx_content: JSON.stringify({
        newRx: [
          {
            name: 'Amoxicillin 500mg',
            strength: '500mg',
            frequency: 'TDS',
            route: 'Oral',
            duration: 5
          }
        ],
        selectedLabs: []
      })
    });
  assert.strictEqual(rxCreateRes.status, 200, 'Doctor prescription creation must succeed.');
  const createdRxId = rxCreateRes.body.rxId;

  const nurseDraftRxRead = await request(app)
    .get(`/api/v1/prescriptions/${createdRxId}`)
    .set('Authorization', `Bearer ${nurseToken}`);
  assert.strictEqual(nurseDraftRxRead.status, 403, 'Nurse must not read draft prescriptions.');
  assert.strictEqual(
    nurseDraftRxRead.body.error.code,
    'PRESCRIPTION_VISIBILITY_RESTRICTED',
    'Draft prescription visibility should be explicitly denied to operational staff.'
  );
  pass('Nurse can only read clinically appropriate prescriptions');

  const authorizeRxRes = await request(app)
    .post(`/api/v1/prescriptions/${createdRxId}/authorize`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ version: 1 });
  assert.strictEqual(authorizeRxRes.status, 200, 'Doctor prescription authorization must succeed.');

  const nurseAuthorizedRxRead = await request(app)
    .get(`/api/v1/prescriptions/${createdRxId}`)
    .set('Authorization', `Bearer ${nurseToken}`);
  assert.strictEqual(nurseAuthorizedRxRead.status, 200, 'Nurse must be able to read authorized prescriptions.');
  assert.strictEqual(nurseAuthorizedRxRead.body.status, 'AUTHORIZED', 'Nurse should only receive authorized prescription data.');
  pass('Nurse can read authorized prescriptions');

  const nurseRxEditAttempt = await request(app)
    .put(`/api/v1/prescriptions/${createdRxId}`)
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ rx_content: 'tamper attempt', version: 2 });
  assert.strictEqual(nurseRxEditAttempt.status, 403, 'Nurse must not edit prescription content.');
  assert.strictEqual(nurseRxEditAttempt.body.error.code, 'FORBIDDEN_ROLE', 'Nurse edit attempts must fail at the role boundary.');
  pass('Nurse cannot edit prescriptions');

  const draftHandoverBlocked = await request(app)
    .post('/api/v1/prescriptions/rx-1/handover')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ dispensing_note: 'Attempted before authorization' });
  assert.strictEqual(draftHandoverBlocked.status, 403, 'Handover must be blocked for non-authorized prescriptions.');
  assert.strictEqual(
    draftHandoverBlocked.body.error.code,
    'PRESCRIPTION_VISIBILITY_RESTRICTED',
    'Draft handover denial must use the explicit visibility code.'
  );
  pass('Prescription handover is blocked until authorization');

  const nurseHandoverRes = await request(app)
    .post(`/api/v1/prescriptions/${createdRxId}/handover`)
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ dispensing_note: 'Printed and handed to the patient attendant.' });
  assert.strictEqual(nurseHandoverRes.status, 200, 'Nurse must be able to mark an authorized prescription as handed over.');

  const handedOverRx = await get(
    `SELECT status, handed_over_by, handed_over_at, dispensing_note
     FROM prescriptions
     WHERE id = ?`,
    [createdRxId]
  );
  assert.strictEqual(handedOverRx.status, 'AUTHORIZED', 'Handover must not alter clinical prescription status.');
  assert.strictEqual(handedOverRx.handed_over_by, 'nurse_qa', 'Handover actor must be persisted.');
  assert.ok(handedOverRx.handed_over_at, 'Handover timestamp must be persisted.');
  assert.strictEqual(handedOverRx.dispensing_note, 'Printed and handed to the patient attendant.', 'Optional dispensing note must be persisted.');
  pass('Nurse can mark handover without changing clinical content');

  const duplicateHandoverRes = await request(app)
    .post(`/api/v1/prescriptions/${createdRxId}/handover`)
    .set('Authorization', `Bearer ${nurseToken}`)
    .send({ dispensing_note: 'Second attempt' });
  assert.strictEqual(duplicateHandoverRes.status, 422, 'Prescription handover should not be repeatable.');
  assert.strictEqual(duplicateHandoverRes.body.error.code, 'PRESCRIPTION_ALREADY_HANDED_OVER', 'Repeat handover should return a stable state code.');

  const handoverAudit = await get(
    `SELECT action
     FROM audit_logs
     WHERE action = ?
     ORDER BY id DESC
     LIMIT 1`,
    [`RX_HANDOVER:${createdRxId}:by:nurse_qa`]
  );
  assert.ok(handoverAudit, 'Prescription handover must write an immutable audit entry.');
  pass('Prescription handover writes immutable audit');

  const patientEditRes = await request(app)
    .patch('/api/v1/patients/pat-3')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Ramesh S.',
      dob: '1975-03-22',
      gender: 'Male',
      phone: '+919876543250'
    });
  assert.strictEqual(patientEditRes.status, 200, 'Admin must be able to correct patient demographics.');
  assert.strictEqual(patientEditRes.body.patient.phone, '+919876543250', 'Updated patient phone should be normalized and returned.');

  const editedPatient = await get(
    `SELECT name, phone
     FROM patients
     WHERE id = ?`,
    ['pat-3']
  );
  assert.strictEqual(editedPatient.name, 'Ramesh S.', 'Admin edit should persist updated patient name.');
  assert.strictEqual(editedPatient.phone, '+919876543250', 'Admin edit should persist updated patient phone.');
  pass('Admin can edit patient demographics safely');

  const duplicatePhoneEditRes = await request(app)
    .patch('/api/v1/patients/pat-3')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ phone: SEEDED_PATIENT_PHONES.pat2 });
  assert.strictEqual(duplicatePhoneEditRes.status, 409, 'Admin demographic correction must reject duplicate phone collisions.');
  assert.strictEqual(duplicatePhoneEditRes.body.error.code, 'PHONE_ALREADY_REGISTERED', 'Duplicate phone correction must return a stable collision code.');
  pass('Duplicate phone protection applies to patient edits');

  const noteCreateRes = await request(app)
    .post('/api/v1/notes')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ patientId: 'pat-2', draft_content: 'Pilot note' });
  assert.strictEqual(noteCreateRes.status, 200, 'Doctor note creation must succeed.');
  pass('Doctor note creation succeeds');

  const noteSaveRes = await request(app)
    .put(`/api/v1/notes/${noteCreateRes.body.noteId}`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ draft_content: 'First save', version: 1 });
  assert.strictEqual(noteSaveRes.status, 200, 'Doctor note save must succeed with the current version.');

  const staleNoteSaveRes = await request(app)
    .put(`/api/v1/notes/${noteCreateRes.body.noteId}`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ draft_content: 'Stale save', version: 1 });
  assert.strictEqual(staleNoteSaveRes.status, 409, 'Stale note saves must return 409.');
  assert.strictEqual(staleNoteSaveRes.body.error.code, 'STALE_STATE', 'Stale note saves must use a stable conflict code.');
  assert.strictEqual(staleNoteSaveRes.body.error.details.latest.__v, 2, 'Conflict response must include the latest server version.');
  assert.strictEqual(staleNoteSaveRes.body.error.details.latest.draft_content, 'First save', 'Conflict response must include the latest server draft content.');
  pass('Stale note saves return latest server content for recovery');

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
