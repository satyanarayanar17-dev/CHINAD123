/**
 * CHETTINAD CARE - BACKEND VERIFICATION SUITE
 *
 * This script verifies the cleaned pilot baseline against a running backend.
 * Start from a fresh local bootstrap state:
 *
 *   cd backend && npm run seed:reset
 *   cd backend && npm run dev
 *   cd backend && npm run verify
 *
 * Only the bootstrap admin is expected to exist at startup. The script creates
 * any doctor, nurse, and patient test records it needs during the run.
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';
const BOOTSTRAP_ADMIN_ID = process.env.BOOTSTRAP_ADMIN_ID || 'admin_qa';
const BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Password123!';

const uniqueSuffix = Date.now().toString(36);
const TEST_USERS = {
  doctor: {
    id: `verify_doctor_${uniqueSuffix}`,
    name: 'Verification Doctor',
    password: 'DoctorVerify2026!'
  },
  nurse: {
    id: `verify_nurse_${uniqueSuffix}`,
    name: 'Verification Nurse',
    password: 'NurseVerify2026!'
  }
};

const TEST_PATIENT = {
  name: 'Verification Patient',
  phone: `+9198${String(Date.now()).slice(-8)}`,
  dob: '1991-04-18',
  gender: 'Female',
  password: 'PatientVerify2026!'
};

let passCount = 0;
let failCount = 0;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  validateStatus: () => true
});

function PASS(label, detail) {
  passCount += 1;
  console.log(`  PASS - ${label}${detail ? ': ' + JSON.stringify(detail) : ''}`);
}

function FAIL(label, detail) {
  failCount += 1;
  console.error(`  FAIL - ${label}${detail ? ': ' + JSON.stringify(detail) : ''}`);
}

function headers(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function requireStatus(res, expected, label) {
  if (res.status !== expected) {
    throw new Error(`${label} expected ${expected} but received ${res.status}: ${JSON.stringify(res.data)}`);
  }
}

async function loginStaff(username, password) {
  return api.post('/auth/login/staff', { username, password });
}

async function loginPatient(username, password) {
  return api.post('/auth/login/patient', { username, password });
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  CHETTINAD CARE - CLEAN-BOOT VERIFICATION SUITE');
  console.log('================================================================\n');

  let adminToken;
  let doctorToken;
  let nurseToken;
  let patientToken;
  let patientId;

  console.log('[1] Bootstrap Authentication\n');

  try {
    const adminLogin = await loginStaff(BOOTSTRAP_ADMIN_ID, BOOTSTRAP_ADMIN_PASSWORD);
    requireStatus(adminLogin, 200, 'Bootstrap admin login');
    adminToken = adminLogin.data.access_token;
    PASS('Bootstrap admin login succeeded', { role: adminLogin.data.role });
  } catch (err) {
    FAIL('Bootstrap admin login', err.message);
    return;
  }

  try {
    const removedDoctor = await loginStaff('doc1_qa', 'Password123!');
    requireStatus(removedDoctor, 401, 'Removed doctor login');
    const removedNurse = await loginStaff('nurse_qa', 'Password123!');
    requireStatus(removedNurse, 401, 'Removed nurse login');
    const removedPatient = await loginPatient('patient_qa', 'Password123!');
    requireStatus(removedPatient, 401, 'Removed patient login');
    PASS('Removed seeded demo identities fail cleanly');
  } catch (err) {
    FAIL('Removed seeded demo identities', err.message);
  }

  try {
    const adminViaPatient = await loginPatient(BOOTSTRAP_ADMIN_ID, BOOTSTRAP_ADMIN_PASSWORD);
    requireStatus(adminViaPatient, 403, 'Admin on patient login path');
    PASS('Admin credentials are rejected on the patient login path');
  } catch (err) {
    FAIL('Admin patient-path rejection', err.message);
  }

  console.log('\n[2] Create Runtime Staff Accounts\n');

  try {
    const createDoctor = await api.post(
      '/admin/users',
      {
        id: TEST_USERS.doctor.id,
        role: 'DOCTOR',
        name: TEST_USERS.doctor.name,
        password: TEST_USERS.doctor.password
      },
      { headers: headers(adminToken) }
    );
    requireStatus(createDoctor, 201, 'Doctor creation');

    const createNurse = await api.post(
      '/admin/users',
      {
        id: TEST_USERS.nurse.id,
        role: 'NURSE',
        name: TEST_USERS.nurse.name,
        password: TEST_USERS.nurse.password
      },
      { headers: headers(adminToken) }
    );
    requireStatus(createNurse, 201, 'Nurse creation');
    PASS('Admin created doctor and nurse accounts');
  } catch (err) {
    FAIL('Runtime staff provisioning', err.message);
  }

  try {
    const doctorLogin = await loginStaff(TEST_USERS.doctor.id, TEST_USERS.doctor.password);
    requireStatus(doctorLogin, 200, 'Doctor login');
    doctorToken = doctorLogin.data.access_token;

    const nurseLogin = await loginStaff(TEST_USERS.nurse.id, TEST_USERS.nurse.password);
    requireStatus(nurseLogin, 200, 'Nurse login');
    nurseToken = nurseLogin.data.access_token;
    PASS('Created doctor and nurse accounts can authenticate');
  } catch (err) {
    FAIL('Runtime staff login', err.message);
  }

  try {
    const doctorOnAdminUsers = await api.get('/admin/users', { headers: headers(doctorToken) });
    requireStatus(doctorOnAdminUsers, 403, 'Doctor admin/users rejection');
    PASS('RBAC still blocks doctor access to admin endpoints');
  } catch (err) {
    FAIL('Doctor RBAC check', err.message);
  }

  console.log('\n[3] Patient Onboarding and Activation\n');

  let activationCode;

  try {
    const patientCreate = await api.post(
      '/patients',
      {
        name: TEST_PATIENT.name,
        phone: TEST_PATIENT.phone,
        dob: TEST_PATIENT.dob,
        gender: TEST_PATIENT.gender,
        issueActivationToken: true
      },
      { headers: headers(adminToken) }
    );
    requireStatus(patientCreate, 201, 'Patient onboarding');
    patientId = patientCreate.data.patient.id;
    activationCode = patientCreate.data.activation.activation_code;
    PASS('Patient onboarding succeeded', { patientId, activationPath: patientCreate.data.activationPath });
  } catch (err) {
    FAIL('Patient onboarding', err.message);
  }

  try {
    const preClaimLogin = await loginPatient(TEST_PATIENT.phone, TEST_PATIENT.password);
    requireStatus(preClaimLogin, 401, 'Pre-claim patient login');

    const activationClaim = await api.post('/activation/claim', {
      phone: TEST_PATIENT.phone,
      otp: activationCode,
      new_password: TEST_PATIENT.password
    });
    requireStatus(activationClaim, 200, 'Activation claim');

    const patientLogin = await loginPatient(TEST_PATIENT.phone, TEST_PATIENT.password);
    requireStatus(patientLogin, 200, 'Patient login after activation');
    patientToken = patientLogin.data.access_token;
    PASS('Patient activation and login succeeded');
  } catch (err) {
    FAIL('Patient activation flow', err.message);
  }

  try {
    const patientViaStaff = await loginStaff(TEST_PATIENT.phone, TEST_PATIENT.password);
    requireStatus(patientViaStaff, 403, 'Patient on staff login path');
    PASS('Patient credentials are rejected on the staff login path');
  } catch (err) {
    FAIL('Patient staff-path rejection', err.message);
  }

  try {
    const appointments = await api.get('/my/appointments', { headers: headers(patientToken) });
    const prescriptions = await api.get('/my/prescriptions', { headers: headers(patientToken) });
    const records = await api.get('/my/records', { headers: headers(patientToken) });
    requireStatus(appointments, 200, 'Patient appointments');
    requireStatus(prescriptions, 200, 'Patient prescriptions');
    requireStatus(records, 200, 'Patient records');
    if (!Array.isArray(prescriptions.data) || prescriptions.data.length !== 0) {
      throw new Error('Patient prescriptions should be empty before a doctor authorizes medication.');
    }
    if (!Array.isArray(records.data) || records.data.length !== 0) {
      throw new Error('Patient records should be empty before a doctor finalizes a note.');
    }
    PASS('Patient portal starts with clean empty records and prescriptions');
  } catch (err) {
    FAIL('Initial patient portal state', err.message);
  }

  console.log('\n[4] Queue and Clinical Workflow\n');

  let noteId;
  let rxId;

  try {
    const handoff = await api.post(
      '/queue/handoff',
      {
        patientId,
        doctorId: TEST_USERS.doctor.id,
        chiefComplaint: 'Verification intake for ongoing chest discomfort and dizziness',
        triagePriority: 'URGENT',
        handoffNotes: 'Escalated during manual verification pass.',
        vitals: {
          height: 170,
          weight: 66,
          systolic: 122,
          diastolic: 80,
          hr: 84,
          temp: 36.9,
          spo2: 98
        }
      },
      { headers: headers(nurseToken) }
    );
    requireStatus(handoff, 200, 'Queue handoff');

    const doctorQueue = await api.get('/queue', { headers: headers(doctorToken) });
    requireStatus(doctorQueue, 200, 'Doctor queue');
    if (!doctorQueue.data.some((slot) => slot.patient?.id === patientId)) {
      throw new Error('Doctor queue does not include the handed-off patient.');
    }
    PASS('Nurse handoff populates the doctor queue');
  } catch (err) {
    FAIL('Queue handoff and doctor queue', err.message);
  }

  try {
    const noteCreate = await api.post(
      '/notes',
      { patientId, draft_content: 'Verification note draft.' },
      { headers: headers(doctorToken) }
    );
    requireStatus(noteCreate, 200, 'Note creation');
    noteId = noteCreate.data.noteId;

    const noteFinalize = await api.post(
      `/notes/${noteId}/finalize`,
      { version: 1 },
      { headers: headers(doctorToken) }
    );
    requireStatus(noteFinalize, 200, 'Note finalize');
    PASS('Doctor note flow succeeded');
  } catch (err) {
    FAIL('Doctor note flow', err.message);
  }

  try {
    const rxCreate = await api.post(
      '/prescriptions',
      { patientId, rx_content: JSON.stringify({ newRx: [{ name: 'Aspirin' }] }) },
      { headers: headers(doctorToken) }
    );
    requireStatus(rxCreate, 200, 'Prescription creation');
    rxId = rxCreate.data.rxId;

    const rxAuthorize = await api.post(
      `/prescriptions/${rxId}/authorize`,
      { version: 1 },
      { headers: headers(doctorToken) }
    );
    requireStatus(rxAuthorize, 200, 'Prescription authorize');

    const rxHandover = await api.post(
      `/prescriptions/${rxId}/handover`,
      { dispensing_note: 'Handed over during verification.' },
      { headers: headers(nurseToken) }
    );
    requireStatus(rxHandover, 200, 'Prescription handover');
    PASS('Prescription authorize and handover flow succeeded');
  } catch (err) {
    FAIL('Prescription workflow', err.message);
  }

  try {
    const prescriptions = await api.get('/my/prescriptions', { headers: headers(patientToken) });
    const records = await api.get('/my/records', { headers: headers(patientToken) });
    requireStatus(prescriptions, 200, 'Patient prescriptions after doctor workflow');
    requireStatus(records, 200, 'Patient records after doctor workflow');
    if (!Array.isArray(prescriptions.data) || prescriptions.data.length !== 1) {
      throw new Error('Authorized prescription should appear in the patient portal.');
    }
    if (!Array.isArray(records.data) || records.data.length !== 1) {
      throw new Error('Finalized clinical note should appear in the patient portal.');
    }
    PASS('Patient portal reflects runtime-authored clinical data');
  } catch (err) {
    FAIL('Patient portal after clinical workflow', err.message);
  }

  console.log('\n[5] Password Reset and Revocation\n');

  try {
    const resetPassword = await api.post(
      `/admin/users/${TEST_USERS.doctor.id}/reset-password`,
      {},
      { headers: headers(adminToken) }
    );
    requireStatus(resetPassword, 200, 'Admin password reset');

    const oldDoctorLogin = await loginStaff(TEST_USERS.doctor.id, TEST_USERS.doctor.password);
    requireStatus(oldDoctorLogin, 401, 'Old doctor password after reset');

    const tempDoctorLogin = await loginStaff(TEST_USERS.doctor.id, resetPassword.data.temporaryPassword);
    requireStatus(tempDoctorLogin, 200, 'Temporary doctor login');

    const changePassword = await api.post(
      '/auth/change-password',
      {
        currentPassword: resetPassword.data.temporaryPassword,
        newPassword: 'DoctorVerifyReset2026!'
      },
      { headers: headers(tempDoctorLogin.data.access_token) }
    );
    requireStatus(changePassword, 200, 'Doctor change-password');
    PASS('Password reset and change-password flow succeeded');
  } catch (err) {
    FAIL('Password reset flow', err.message);
  }

  try {
    const disableNurse = await api.patch(
      `/admin/users/${TEST_USERS.nurse.id}/disable`,
      {},
      { headers: headers(adminToken) }
    );
    requireStatus(disableNurse, 200, 'Disable nurse account');

    const revokedNurseSession = await api.get('/auth/me', { headers: headers(nurseToken) });
    requireStatus(revokedNurseSession, 401, 'Revoked nurse token');
    const revocationCode =
      revokedNurseSession.data?.error?.code ||
      revokedNurseSession.data?.error ||
      null;
    if (!['TOKEN_REVOKED', 'INVALID_CREDENTIALS', 'ACCOUNT_DISABLED'].includes(revocationCode)) {
      throw new Error(`Unexpected disabled-user rejection payload: ${JSON.stringify(revokedNurseSession.data)}`);
    }
    PASS('Disable flow revokes live nurse tokens');
  } catch (err) {
    FAIL('Disable and revocation flow', err.message);
  }

  console.log('\n================================================================');
  console.log(`Verification complete. Passed: ${passCount}  Failed: ${failCount}`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('\nUNEXPECTED VERIFICATION FAILURE');
  console.error(err);
  process.exit(1);
});
