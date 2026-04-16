/**
 * backend/test.js
 *
 * In-process verification suite for the cleaned pilot baseline.
 * The database now starts with only the bootstrap admin account.
 * Any doctor, nurse, or patient records used here are created dynamically
 * inside the test run and are not treated as fixed seeded identities.
 */

process.env.ALLOW_SEED_RESET = 'true';
process.env.ACTIVATION_OTP_DELIVERY = 'api_response';

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const app = require('./server');
const { resetAndSeedDatabase, get, all, run } = require('./database');
const { SEEDED_PASSWORD } = require('./seed');

const TEST_USERS = {
  admin: { id: 'admin_qa', password: SEEDED_PASSWORD },
  doctor: {
    id: 'staff_doctor_suite',
    name: 'Clinical Doctor Suite',
    department: 'Cardiology',
    password: 'DoctorSuite2026!'
  },
  nurse: { id: 'staff_nurse_suite', name: 'Clinical Nurse Suite', password: 'NurseSuite2026!' }
};

const TEST_PATIENT = {
  name: 'Aparna Menon',
  phone: '+919811112222',
  dob: '1990-01-20',
  gender: 'Female',
  password: 'PatientSuite2026!'
};

function pass(label, detail) {
  console.log(`  PASS - ${label}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function extractErrorCode(response) {
  if (typeof response?.body?.error === 'string') {
    return response.body.error;
  }

  if (response?.body?.error && typeof response.body.error.code === 'string') {
    return response.body.error.code;
  }

  return null;
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

async function createStaffAccount(adminToken, payload) {
  return request(app)
    .post('/api/v1/admin/users')
    .set(auth(adminToken))
    .send(payload);
}

async function updateStaffAccount(adminToken, userId, payload) {
  return request(app)
    .patch(`/api/v1/admin/users/${userId}`)
    .set(auth(adminToken))
    .send(payload);
}

async function createPatient(adminToken, payload) {
  return request(app)
    .post('/api/v1/patients')
    .set(auth(adminToken))
    .send(payload);
}

async function runVerification() {
  console.log('--- STARTING CLEAN-BOOT BACKEND VERIFICATION ---\n');

  console.log('[SETUP] Resetting database to bootstrap baseline...');
  await resetAndSeedDatabase();
  console.log('[SETUP] Done.\n');

  console.log('[1] Bootstrap Seed State\n');

  const seededUsers = await all(`SELECT id, role, password_hash FROM users ORDER BY id`);
  assert.equal(seededUsers.length, 1, 'Only the bootstrap admin should exist after reset.');
  assert.equal(seededUsers[0].id, TEST_USERS.admin.id, 'Bootstrap admin id must remain stable.');
  assert.equal(seededUsers[0].role, 'ADMIN', 'Bootstrap account must be admin.');
  assert.notEqual(seededUsers[0].password_hash, SEEDED_PASSWORD, 'Seeded password must never be stored in plaintext.');
  assert.equal(await bcrypt.compare(SEEDED_PASSWORD, seededUsers[0].password_hash), true, 'Seeded admin password hash must validate.');
  pass('Bootstrap seed contains only the admin account');

  const patientCount = await get(`SELECT COUNT(*) AS count FROM patients`);
  const encounterCount = await get(`SELECT COUNT(*) AS count FROM encounters`);
  assert.equal(Number(patientCount.count), 0, 'No patients should be preloaded.');
  assert.equal(Number(encounterCount.count), 0, 'No encounters should be preloaded.');
  pass('No patient or encounter data is preloaded');

  console.log('\n[2] Health and Admin Authentication\n');

  const healthRes = await request(app).get('/api/v1/health');
  assert.equal(healthRes.status, 200, 'Health endpoint must return 200.');
  assert.equal(healthRes.body.status, 'ok', 'Health endpoint must return ok status.');
  pass('Health endpoint returns a healthy status');

  const adminAgent = request.agent(app);
  const adminLogin = await loginStaff(TEST_USERS.admin.id, TEST_USERS.admin.password, adminAgent);
  assert.equal(adminLogin.status, 200, 'Bootstrap admin login must succeed.');
  assert.equal(adminLogin.body.role, 'admin', 'Admin login must return admin role.');
  assert.equal(adminLogin.body.account_type, 'staff', 'Admin login must stay on the staff boundary.');
  assert.ok(
    (adminLogin.headers['set-cookie'] || []).some((cookie) => cookie.startsWith('cc_refresh_token=')),
    'Admin login must issue a refresh cookie.'
  );
  pass('Admin login succeeds with refresh cookie');

  const adminRefresh = await adminAgent.post('/api/v1/auth/refresh').send({});
  assert.equal(adminRefresh.status, 200, 'Admin refresh must succeed.');
  assert.equal(adminRefresh.body.role, 'admin', 'Refresh must preserve admin role.');
  assert.equal(adminRefresh.body.account_type, 'staff', 'Refresh must preserve staff account type.');
  pass('Admin refresh preserves role and account type');

  const adminToken = adminRefresh.body.access_token;
  const adminMe = await request(app).get('/api/v1/auth/me').set(auth(adminToken));
  assert.equal(adminMe.status, 200, 'Admin /auth/me must succeed.');
  assert.equal(adminMe.body.id, TEST_USERS.admin.id, 'Admin /auth/me must return the bootstrap admin.');
  pass('/auth/me returns the bootstrap admin identity');

  const blockLastAdminDisableRes = await request(app)
    .patch(`/api/v1/admin/users/${TEST_USERS.admin.id}/disable`)
    .set(auth(adminToken))
    .send({});
  assert.equal(blockLastAdminDisableRes.status, 409, 'Disabling the last active admin must be blocked.');
  assert.equal(extractErrorCode(blockLastAdminDisableRes), 'LAST_ACTIVE_ADMIN_PROTECTED', 'Last-admin disable must return a stable protection code.');

  const blockLastAdminDowngradeRes = await updateStaffAccount(adminToken, TEST_USERS.admin.id, {
    fullName: 'Admin QA',
    role: 'NURSE',
    department: null
  });
  assert.equal(blockLastAdminDowngradeRes.status, 409, 'Downgrading the last active admin must be blocked.');
  assert.equal(extractErrorCode(blockLastAdminDowngradeRes), 'LAST_ACTIVE_ADMIN_PROTECTED', 'Last-admin downgrade must return a stable protection code.');
  pass('Last active admin continuity protections are enforced');

  console.log('\n[3] No Demo Identities Remain Seeded\n');

  const missingAccountType = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', 'generic-missing-account-type')
    .send({ username: TEST_USERS.admin.id, password: TEST_USERS.admin.password });
  assert.equal(missingAccountType.status, 400, 'Generic login must require account_type.');
  assert.equal(missingAccountType.body.error.code, 'ACCOUNT_TYPE_REQUIRED', 'Generic login must return stable account type error.');
  pass('Generic login requires an explicit account type');

  for (const removedStaffId of ['doc1_qa', 'doc2_qa', 'nurse_qa']) {
    const removedLogin = await loginStaff(removedStaffId, SEEDED_PASSWORD);
    assert.equal(removedLogin.status, 401, `${removedStaffId} should not exist anymore.`);
  }
  pass('Removed seeded staff identities fail cleanly');

  const removedPatientLogin = await loginPatient('patient_qa', SEEDED_PASSWORD);
  assert.equal(removedPatientLogin.status, 401, 'Removed seeded patient identity must fail cleanly.');
  pass('Removed seeded patient identity fails cleanly');

  const adminViaPatientLogin = await loginPatient(TEST_USERS.admin.id, TEST_USERS.admin.password);
  assert.equal(adminViaPatientLogin.status, 403, 'Admin credentials must be rejected on patient login.');
  assert.equal(adminViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Admin rejection must be explicit on the patient boundary.');
  pass('Admin credentials are blocked from the patient login path');

  const initialUsersRes = await request(app).get('/api/v1/admin/users').set(auth(adminToken));
  assert.equal(initialUsersRes.status, 200, 'Admin must be able to list users.');
  assert.equal(initialUsersRes.body.length, 1, 'Only the admin should be visible before onboarding staff.');
  pass('User directory starts with only the bootstrap admin');

  const emptyQueueRes = await request(app).get('/api/v1/queue').set(auth(adminToken));
  assert.equal(emptyQueueRes.status, 200, 'Admin queue read must succeed.');
  assert.deepEqual(emptyQueueRes.body, [], 'Queue should start empty with no demo encounters.');
  pass('Queue starts empty without seeded runtime records');

  console.log('\n[4] Staff Provisioning and RBAC\n');

  const departmentsRes = await request(app).get('/api/v1/admin/departments').set(auth(adminToken));
  assert.equal(departmentsRes.status, 200, 'Admin must be able to read the department catalog.');
  assert.ok(departmentsRes.body.includes(TEST_USERS.doctor.department), 'Department catalog must contain Cardiology.');
  pass('Department catalog is exposed through the admin API');

  const missingDepartmentRes = await createStaffAccount(adminToken, {
    id: 'doctor_missing_department_suite',
    role: 'DOCTOR',
    name: 'Doctor Missing Department',
    password: 'DoctorMissing2026!'
  });
  assert.equal(missingDepartmentRes.status, 400, 'Doctor creation must require a department.');
  assert.equal(extractErrorCode(missingDepartmentRes), 'DEPARTMENT_REQUIRED', 'Doctor department errors must be explicit.');
  pass('Doctor provisioning rejects missing departments');

  const doctorCreateRes = await createStaffAccount(adminToken, {
    id: TEST_USERS.doctor.id,
    role: 'DOCTOR',
    name: TEST_USERS.doctor.name,
    password: TEST_USERS.doctor.password,
    department: TEST_USERS.doctor.department
  });
  assert.equal(doctorCreateRes.status, 201, 'Doctor creation must succeed.');
  assert.equal(doctorCreateRes.body.department, TEST_USERS.doctor.department, 'Created doctor must echo the canonical department.');

  const nurseCreateRes = await createStaffAccount(adminToken, {
    id: TEST_USERS.nurse.id,
    role: 'NURSE',
    name: TEST_USERS.nurse.name,
    password: TEST_USERS.nurse.password
  });
  assert.equal(nurseCreateRes.status, 201, 'Nurse creation must succeed.');
  pass('Admin can create doctor and nurse accounts on demand');

  const duplicateDoctorRes = await createStaffAccount(adminToken, {
    id: TEST_USERS.doctor.id,
    role: 'DOCTOR',
    name: 'Duplicate Doctor',
    password: 'DuplicateDoctor2026!',
    department: TEST_USERS.doctor.department
  });
  assert.equal(duplicateDoctorRes.status, 409, 'Duplicate staff usernames must be rejected.');
  assert.equal(extractErrorCode(duplicateDoctorRes), 'USER_EXISTS', 'Duplicate staff usernames must return USER_EXISTS.');
  pass('Duplicate usernames are rejected cleanly');

  const staffDirectoryRes = await request(app).get('/api/v1/admin/users').set(auth(adminToken));
  assert.equal(staffDirectoryRes.status, 200, 'Admin must be able to refresh the staff directory after provisioning.');
  const createdDoctor = staffDirectoryRes.body.find((user) => user.id === TEST_USERS.doctor.id);
  const createdNurse = staffDirectoryRes.body.find((user) => user.id === TEST_USERS.nurse.id);
  assert.equal(createdDoctor?.department, TEST_USERS.doctor.department, 'Doctor list rows must include the persisted department.');
  assert.equal(createdDoctor?.status, 'ACTIVE', 'Doctor list rows must expose account status.');
  assert.equal(createdNurse?.department ?? null, null, 'Nurse list rows must not force doctor-only department data.');
  pass('Staff directory returns persisted user metadata from the database');

  const immutableUsernameRes = await updateStaffAccount(adminToken, TEST_USERS.doctor.id, {
    username: 'doctor_persistently_renamed',
    fullName: TEST_USERS.doctor.name,
    role: 'DOCTOR',
    department: 'Neurology'
  });
  assert.equal(immutableUsernameRes.status, 400, 'Username edits must be blocked when the login ID is the primary key.');
  assert.equal(extractErrorCode(immutableUsernameRes), 'USERNAME_IMMUTABLE', 'Username immutability must be explicit.');

  const doctorEditRes = await updateStaffAccount(adminToken, TEST_USERS.doctor.id, {
    fullName: 'Clinical Doctor Suite Updated',
    role: 'DOCTOR',
    department: 'Neurology'
  });
  assert.equal(doctorEditRes.status, 200, 'Editing doctor profile details must succeed.');
  assert.equal(doctorEditRes.body.updated, true, 'Successful profile edits must be reported.');
  assert.equal(doctorEditRes.body.user.name, 'Clinical Doctor Suite Updated', 'Edited full name must be returned.');
  assert.equal(doctorEditRes.body.user.department, 'Neurology', 'Edited department must be returned.');

  const nurseEditRes = await updateStaffAccount(adminToken, TEST_USERS.nurse.id, {
    fullName: 'Clinical Nurse Suite Updated',
    role: 'NURSE',
    department: null
  });
  assert.equal(nurseEditRes.status, 200, 'Editing nurse profile details must succeed.');
  assert.equal(nurseEditRes.body.user.department, null, 'Nurse edits must keep doctor-only department data empty.');
  pass('Admin can edit persisted staff profile fields while keeping usernames immutable');

  const doctorAgent = request.agent(app);
  const nurseAgent = request.agent(app);

  const doctorLogin = await loginStaff(TEST_USERS.doctor.id, TEST_USERS.doctor.password, doctorAgent);
  const nurseLogin = await loginStaff(TEST_USERS.nurse.id, TEST_USERS.nurse.password, nurseAgent);
  assert.equal(doctorLogin.status, 200, 'Doctor login must succeed after creation.');
  assert.equal(nurseLogin.status, 200, 'Nurse login must succeed after creation.');
  pass('Created doctor and nurse accounts can authenticate');

  const doctorToken = doctorLogin.body.access_token;
  const nurseToken = nurseLogin.body.access_token;

  const doctorViaPatientLogin = await loginPatient(TEST_USERS.doctor.id, TEST_USERS.doctor.password);
  assert.equal(doctorViaPatientLogin.status, 403, 'Doctor credentials must be rejected on the patient path.');
  assert.equal(doctorViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Doctor boundary mismatch must stay explicit.');

  const nurseViaPatientLogin = await loginPatient(TEST_USERS.nurse.id, TEST_USERS.nurse.password);
  assert.equal(nurseViaPatientLogin.status, 403, 'Nurse credentials must be rejected on the patient path.');
  assert.equal(nurseViaPatientLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Nurse boundary mismatch must stay explicit.');
  pass('Staff credentials cannot cross into the patient login boundary');

  const doctorOnAdminUsers = await request(app).get('/api/v1/admin/users').set(auth(doctorToken));
  assert.equal(doctorOnAdminUsers.status, 403, 'Doctor must not access admin directory endpoints.');

  const unauthenticatedQueue = await request(app).get('/api/v1/queue');
  assert.equal(unauthenticatedQueue.status, 401, 'Queue must stay protected.');

  const nurseCreateNote = await request(app)
    .post('/api/v1/notes')
    .set(auth(nurseToken))
    .send({ patientId: 'missing-patient', draft_content: 'Should not be accepted.' });
  assert.equal(nurseCreateNote.status, 403, 'Nurse note creation must fail at the role boundary.');
  pass('RBAC still protects admin and doctor-only routes');

  console.log('\n[5] Patient Onboarding Without Seeded Demo Records\n');

  const patientCreateRes = await createPatient(adminToken, {
    name: TEST_PATIENT.name,
    phone: TEST_PATIENT.phone,
    dob: TEST_PATIENT.dob,
    gender: TEST_PATIENT.gender,
    issueActivationToken: true
  });
  assert.equal(patientCreateRes.status, 201, 'Patient onboarding must succeed.');
  assert.ok(patientCreateRes.body.patient?.id, 'Patient onboarding must return a patient id.');
  assert.ok(patientCreateRes.body.encounterId, 'Patient onboarding must create an active encounter.');
  assert.equal(patientCreateRes.body.activationPath, '/patient/activate', 'Patient onboarding must preserve the activation route.');
  assert.ok(patientCreateRes.body.activation?.activation_code, 'Activation code must be returned in API delivery mode.');
  pass('Patient onboarding creates a patient record and activation token');

  const patientId = patientCreateRes.body.patient.id;
  const activationCode = patientCreateRes.body.activation.activation_code;

  const patientBeforeClaim = await loginPatient(TEST_PATIENT.phone, TEST_PATIENT.password);
  assert.equal(patientBeforeClaim.status, 401, 'Patient login must fail before activation claim.');
  pass('Unclaimed patient account cannot log in yet');

  const activationClaimRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      phone: TEST_PATIENT.phone,
      otp: activationCode,
      new_password: TEST_PATIENT.password
    });
  assert.equal(activationClaimRes.status, 200, 'Patient activation claim must succeed.');
  pass('Patient activation claim succeeds');

  const invalidActivationClaimRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      phone: TEST_PATIENT.phone,
      otp: '000000',
      new_password: 'AnotherPatientPass2026!'
  });
  assert.equal(invalidActivationClaimRes.status, 409, 'Used activation codes should not be treated as generic success.');
  assert.equal(extractErrorCode(invalidActivationClaimRes), 'ACTIVATION_CODE_USED', 'Used activation codes must fail with ACTIVATION_CODE_USED.');

  const usedActivationClaimRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      phone: TEST_PATIENT.phone,
      otp: activationCode,
      new_password: 'AnotherPatientPass2026!'
  });
  assert.equal(usedActivationClaimRes.status, 409, 'Reusing an activation code must fail.');
  assert.equal(extractErrorCode(usedActivationClaimRes), 'ACTIVATION_CODE_USED', 'Reused activation codes must fail with ACTIVATION_CODE_USED.');
  pass('Used activation codes fail cleanly');

  const expiredPatient = {
    name: 'Nivetha Raman',
    phone: '+919822223333',
    dob: '1993-07-12',
    gender: 'Female'
  };
  const expiredPatientCreateRes = await createPatient(adminToken, {
    ...expiredPatient,
    issueActivationToken: true
  });
  assert.equal(expiredPatientCreateRes.status, 201, 'Expired-token patient onboarding must succeed.');
  const expiredActivationCode = expiredPatientCreateRes.body.activation.activation_code;
  await run(
    `UPDATE patient_activation_tokens
     SET expires_at = ?
     WHERE patient_id = ?`,
    [new Date(Date.now() - 60 * 1000).toISOString(), expiredPatientCreateRes.body.patient.id]
  );

  const expiredActivationClaimRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      phone: expiredPatient.phone,
      otp: expiredActivationCode,
      new_password: 'ExpiredPatient2026!'
  });
  assert.equal(expiredActivationClaimRes.status, 410, 'Expired activation codes must fail with 410.');
  assert.equal(extractErrorCode(expiredActivationClaimRes), 'EXPIRED_TOKEN', 'Expired activation codes must return EXPIRED_TOKEN.');
  pass('Expired activation codes fail cleanly');

  const freshPatient = {
    name: 'Harini Subramanian',
    phone: '+919833334444',
    dob: '1988-11-05',
    gender: 'Female'
  };
  const freshPatientCreateRes = await createPatient(adminToken, {
    ...freshPatient,
    issueActivationToken: true
  });
  assert.equal(freshPatientCreateRes.status, 201, 'Fresh invalid-code patient onboarding must succeed.');

  const invalidActivationFreshRes = await request(app)
    .post('/api/v1/activation/claim')
    .send({
      phone: freshPatient.phone,
      otp: '111111',
      new_password: 'FreshInvalid2026!'
  });
  assert.equal(invalidActivationFreshRes.status, 401, 'Invalid activation codes must fail.');
  assert.equal(extractErrorCode(invalidActivationFreshRes), 'INVALID_TOKEN', 'Invalid activation codes must return INVALID_TOKEN.');
  pass('Invalid activation codes fail cleanly');

  const patientLogin = await loginPatient(TEST_PATIENT.phone, TEST_PATIENT.password);
  assert.equal(patientLogin.status, 200, 'Patient login must succeed after activation.');
  assert.equal(patientLogin.body.role, 'patient', 'Patient login must preserve patient role.');
  assert.equal(patientLogin.body.account_type, 'patient', 'Patient login must preserve patient boundary.');
  pass('Activated patient can log in on the patient path');

  const patientToken = patientLogin.body.access_token;

  const patientViaStaffLogin = await loginStaff(TEST_PATIENT.phone, TEST_PATIENT.password);
  assert.equal(patientViaStaffLogin.status, 403, 'Patient credentials must be rejected on the staff path.');
  assert.equal(patientViaStaffLogin.body.error, 'ACCOUNT_TYPE_MISMATCH', 'Patient mismatch must stay explicit.');
  pass('Patient credentials cannot cross into the staff login boundary');

  const patientAppointmentsBeforeRecords = await request(app).get('/api/v1/my/appointments').set(auth(patientToken));
  const patientPrescriptionsBeforeRecords = await request(app).get('/api/v1/my/prescriptions').set(auth(patientToken));
  const patientRecordsBeforeRecords = await request(app).get('/api/v1/my/records').set(auth(patientToken));
  assert.equal(patientAppointmentsBeforeRecords.status, 200, 'Patient appointments should be readable.');
  assert.equal(patientPrescriptionsBeforeRecords.status, 200, 'Patient prescriptions should be readable.');
  assert.equal(patientRecordsBeforeRecords.status, 200, 'Patient records should be readable.');
  assert.equal(patientAppointmentsBeforeRecords.body.length, 1, 'Patient should see the active encounter appointment.');
  assert.deepEqual(patientPrescriptionsBeforeRecords.body, [], 'Patient prescriptions should start empty.');
  assert.deepEqual(patientRecordsBeforeRecords.body, [], 'Patient clinical records should start empty.');
  pass('Patient portal returns clean empty collections until clinical data exists');

  console.log('\n[6] Queue, Clinical Authoring, and Patient Portal Data\n');

  const handoffRes = await request(app)
    .post('/api/v1/queue/handoff')
    .set(auth(nurseToken))
    .send({
      patientId,
      doctorId: TEST_USERS.doctor.id,
      chiefComplaint: 'Persistent chest pain and dizziness during intake evaluation',
      triagePriority: 'URGENT',
      handoffNotes: 'Escalated from intake after vitals review.',
      vitals: {
        height: 168,
        weight: 68,
        systolic: 124,
        diastolic: 82,
        hr: 88,
        temp: 37.1,
        spo2: 98
      }
    });
  assert.equal(handoffRes.status, 200, 'Nurse handoff must succeed.');
  assert.equal(handoffRes.body.assignedDoctor.id, TEST_USERS.doctor.id, 'Handoff must assign the created doctor.');
  pass('Nurse can hand off a real patient to a created doctor');

  const blockedDoctorRoleChangeRes = await updateStaffAccount(adminToken, TEST_USERS.doctor.id, {
    fullName: 'Clinical Doctor Suite Updated',
    role: 'NURSE',
    department: null
  });
  assert.equal(blockedDoctorRoleChangeRes.status, 409, 'Doctors with active assignments must not be role-changed away from doctor.');
  assert.equal(extractErrorCode(blockedDoctorRoleChangeRes), 'ROLE_CHANGE_BLOCKED', 'Blocked role changes must return ROLE_CHANGE_BLOCKED.');
  pass('Role changes respect active clinical assignment safety rules');

  const doctorQueueRes = await request(app).get('/api/v1/queue').set(auth(doctorToken));
  assert.equal(doctorQueueRes.status, 200, 'Doctor queue read must succeed.');
  assert.equal(doctorQueueRes.body.length, 1, 'Doctor queue should include the handed-off patient.');
  assert.equal(doctorQueueRes.body[0].patient.id, patientId, 'Doctor queue should reference the created patient.');
  pass('Doctor queue is populated from runtime-created data only');

  const invalidBreakGlass = await request(app)
    .post(`/api/v1/patients/${patientId}/break-glass`)
    .set(auth(doctorToken))
    .send({ justification: 'too short' });
  assert.equal(invalidBreakGlass.status, 400, 'Break-glass must reject short justification.');

  const validBreakGlass = await request(app)
    .post(`/api/v1/patients/${patientId}/break-glass`)
    .set(auth(doctorToken))
    .send({ justification: 'Emergency chest pain escalation with incomplete history. Access is needed to review finalized records before treatment.' });
  assert.equal(validBreakGlass.status, 200, 'Break-glass must succeed with adequate justification.');
  pass('Break-glass remains available for real patient records');

  const noteCreateRes = await request(app)
    .post('/api/v1/notes')
    .set(auth(doctorToken))
    .send({ patientId, draft_content: 'Initial assessment documented.' });
  assert.equal(noteCreateRes.status, 200, 'Doctor note creation must succeed.');
  assert.ok(noteCreateRes.body.noteId, 'Note id must be returned.');

  const staleNoteUpdateRes = await request(app)
    .put(`/api/v1/notes/${noteCreateRes.body.noteId}`)
    .set(auth(doctorToken))
    .send({ draft_content: 'Conflicting save', version: 99 });
  assert.equal(staleNoteUpdateRes.status, 409, 'Stale note save must be rejected.');

  const noteUpdateRes = await request(app)
    .put(`/api/v1/notes/${noteCreateRes.body.noteId}`)
    .set(auth(doctorToken))
    .send({ draft_content: 'Updated assessment after clinical review.', version: 1 });
  assert.equal(noteUpdateRes.status, 200, 'Current note save must succeed.');

  const noteFinalizeRes = await request(app)
    .post(`/api/v1/notes/${noteCreateRes.body.noteId}/finalize`)
    .set(auth(doctorToken))
    .send({ version: 2 });
  assert.equal(noteFinalizeRes.status, 200, 'Note finalize must succeed.');
  pass('Doctor note flow works against runtime-created patients');

  const rxCreateRes = await request(app)
    .post('/api/v1/prescriptions')
    .set(auth(doctorToken))
    .send({ patientId, rx_content: JSON.stringify({ newRx: [{ name: 'Aspirin' }] }) });
  assert.equal(rxCreateRes.status, 200, 'Prescription creation must succeed.');

  const staleRxUpdateRes = await request(app)
    .put(`/api/v1/prescriptions/${rxCreateRes.body.rxId}`)
    .set(auth(doctorToken))
    .send({ rx_content: 'Conflicting save', version: 99 });
  assert.equal(staleRxUpdateRes.status, 409, 'Stale prescription save must be rejected.');

  const rxAuthorizeRes = await request(app)
    .post(`/api/v1/prescriptions/${rxCreateRes.body.rxId}/authorize`)
    .set(auth(doctorToken))
    .send({ version: 1 });
  assert.equal(rxAuthorizeRes.status, 200, 'Prescription authorization must succeed.');

  const rxHandoverRes = await request(app)
    .post(`/api/v1/prescriptions/${rxCreateRes.body.rxId}/handover`)
    .set(auth(nurseToken))
    .send({ dispensing_note: 'Prepared for dispensing after authorization.' });
  assert.equal(rxHandoverRes.status, 200, 'Authorized prescription handover must succeed.');
  pass('Doctor and nurse workflows operate on runtime-created prescriptions');

  const patientPrescriptionsAfterRecords = await request(app).get('/api/v1/my/prescriptions').set(auth(patientToken));
  const patientRecordsAfterRecords = await request(app).get('/api/v1/my/records').set(auth(patientToken));
  assert.equal(patientPrescriptionsAfterRecords.status, 200, 'Patient prescriptions must remain readable.');
  assert.equal(patientRecordsAfterRecords.status, 200, 'Patient records must remain readable.');
  assert.equal(patientPrescriptionsAfterRecords.body.length, 1, 'Authorized prescription must appear in the patient portal.');
  assert.equal(patientRecordsAfterRecords.body.length, 1, 'Finalized note must appear in the patient portal.');
  pass('Patient portal surfaces only real runtime-authored data');

  console.log('\n[7] Password Reset and Revocation\n');

  const resetPasswordRes = await request(app)
    .post(`/api/v1/admin/users/${TEST_USERS.doctor.id}/reset-password`)
    .set(auth(adminToken))
    .send({});
  assert.equal(resetPasswordRes.status, 200, 'Admin password reset must succeed.');
  assert.equal(resetPasswordRes.body.must_change_password, true, 'Password reset must require a change on next login.');

  const oldDoctorLogin = await loginStaff(TEST_USERS.doctor.id, TEST_USERS.doctor.password);
  assert.equal(oldDoctorLogin.status, 401, 'Old doctor password must stop working after reset.');

  const tempDoctorLogin = await loginStaff(TEST_USERS.doctor.id, resetPasswordRes.body.temporaryPassword);
  assert.equal(tempDoctorLogin.status, 200, 'Temporary doctor password must work.');
  assert.equal(tempDoctorLogin.body.must_change_password, true, 'Temporary login must flag must_change_password.');

  const tempDoctorToken = tempDoctorLogin.body.access_token;
  const blockedByMustChangeRes = await request(app).get('/api/v1/queue').set(auth(tempDoctorToken));
  assert.equal(blockedByMustChangeRes.status, 403, 'must_change_password sessions must be blocked from protected app routes.');
  assert.equal(extractErrorCode(blockedByMustChangeRes), 'PASSWORD_CHANGE_REQUIRED', 'must_change_password blocks must use PASSWORD_CHANGE_REQUIRED.');

  const changePasswordRes = await request(app)
    .post('/api/v1/auth/change-password')
    .set(auth(tempDoctorToken))
    .send({
      currentPassword: resetPasswordRes.body.temporaryPassword,
      newPassword: 'DoctorSuiteReset2026!'
  });
  assert.equal(changePasswordRes.status, 200, 'Doctor password change must succeed.');

  const changedDoctorLogin = await loginStaff(TEST_USERS.doctor.id, 'DoctorSuiteReset2026!');
  assert.equal(changedDoctorLogin.status, 200, 'Doctor must be able to log in with the changed password.');

  const resetAuditLeakCheck = await all(
    `SELECT action, prior_state, new_state
     FROM audit_logs
     WHERE action LIKE 'ADMIN_PASS_RESET:%' OR action LIKE 'SYS_AUTH_PASSWORD_CHANGE:%'`
  );
  const serializedResetAudit = JSON.stringify(resetAuditLeakCheck);
  assert.equal(serializedResetAudit.includes(resetPasswordRes.body.temporaryPassword), false, 'Temporary passwords must not be written to audit logs.');
  assert.equal(serializedResetAudit.includes('"password_hash"'), false, 'Password hashes must not be written to audit logs.');

  const activationAuditLeakCheck = await all(
    `SELECT action, prior_state, new_state
     FROM audit_logs
     WHERE action LIKE 'PATIENT_REGISTER:%' OR action = 'PATIENT_ACTIVATION_OTP_GENERATED' OR action = 'PATIENT_ACTIVATION_CLAIM_SUCCESS'`
  );
  const serializedActivationAudit = JSON.stringify(activationAuditLeakCheck);
  assert.equal(serializedActivationAudit.includes(activationCode), false, 'Activation codes must not be written to audit logs.');
  pass('Password reset and change-password flows remain intact without sensitive audit leakage');

  const disableNurseRes = await request(app)
    .patch(`/api/v1/admin/users/${TEST_USERS.nurse.id}/disable`)
    .set(auth(adminToken))
    .send({});
  assert.equal(disableNurseRes.status, 200, 'Admin disable must succeed.');

  const revokedNurseSession = await request(app).get('/api/v1/auth/me').set(auth(nurseToken));
  assert.equal(revokedNurseSession.status, 401, 'Disabled user token must be rejected.');
  const revocationCode =
    revokedNurseSession.body?.error?.code ||
    revokedNurseSession.body?.error ||
    null;
  assert.ok(
    ['TOKEN_REVOKED', 'INVALID_CREDENTIALS', 'ACCOUNT_DISABLED'].includes(revocationCode),
    `Disabled user must fail with a clean 401 auth denial. Received: ${JSON.stringify(revokedNurseSession.body)}`
  );

  const disabledNurseLogin = await loginStaff(TEST_USERS.nurse.id, TEST_USERS.nurse.password);
  assert.equal(disabledNurseLogin.status, 401, 'Disabled nurse must not be able to log in.');
  assert.equal(disabledNurseLogin.body.error, 'ACCOUNT_DISABLED', 'Disabled account must return ACCOUNT_DISABLED.');
  pass('Disable flow revokes existing tokens and blocks future login');

  console.log('\n[8] Reset Endpoint Returns to Clean Baseline\n');

  const doctorSeedResetAttempt = await request(app)
    .post('/api/v1/internal/seed-reset')
    .set(auth(changedDoctorLogin.body.access_token))
    .send({});
  assert.equal(doctorSeedResetAttempt.status, 403, 'Non-admin must not trigger seed-reset.');

  const adminSeedResetRes = await request(app)
    .post('/api/v1/internal/seed-reset')
    .set(auth(adminToken))
    .send({});
  assert.equal(adminSeedResetRes.status, 200, 'Admin seed-reset must succeed in local verification mode.');

  const usersAfterReset = await all(`SELECT id, role FROM users ORDER BY id`);
  const patientsAfterReset = await get(`SELECT COUNT(*) AS count FROM patients`);
  assert.deepEqual(usersAfterReset, [{ id: TEST_USERS.admin.id, role: 'ADMIN' }], 'Seed-reset must restore the clean admin-only bootstrap state.');
  assert.equal(Number(patientsAfterReset.count), 0, 'Seed-reset must remove runtime-created patient data.');
  pass('Seed-reset restores the clean bootstrap baseline without demo identities');

  console.log('\nALL CHECKS PASSED');
}

runVerification().catch((err) => {
  console.error('\nVERIFICATION FAILED');
  console.error(err);
  process.exit(1);
});
