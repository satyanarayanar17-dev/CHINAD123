/**
 * CHETTINAD CARE — BACKEND VERIFICATION SUITE
 * 
 * Tests the hardened backend against all critical security and clinical flows.
 * Requires a running backend with seeded data (deploy-seed.js --confirm-destroy)
 * 
 * Run: node verify.js
 * Env: Backend must be running on localhost:3001 with seeded accounts
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';

// These must match what deploy-seed.js provisions
const SEEDED_STAFF_PASSWORD = 'Password123!';

let pass = 0;
let fail = 0;

function PASS(label, detail) {
  pass++;
  console.log(`  ✓ PASS — ${label}${detail ? ': ' + JSON.stringify(detail) : ''}`);
}

function FAIL(label, detail) {
  fail++;
  console.error(`  ✗ FAIL — ${label}${detail ? ': ' + JSON.stringify(detail) : ''}`);
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  CHETTINAD CARE — BACKEND VERIFICATION SUITE');
  console.log('================================================================\n');

  let doctorToken = null;
  let nurseToken = null;
  let adminToken = null;

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1: AUTHENTICATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[1] Authentication\n');

  try {
    console.log('  [1.1] Login with unknown user (expect 401)');
    await axios.post(`${API_BASE}/auth/login`, { username: 'sneaky_hacker', password: 'anything' });
    FAIL('Unknown user login should be rejected', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Unknown user login rejected with 401', { code: err.response.data?.error });
    else FAIL('Unknown user login', { status: err.response?.status, err: err.message });
  }

  try {
    console.log('  [1.2] Login doc1_qa with WRONG password (expect 401)');
    await axios.post(`${API_BASE}/auth/login`, { username: 'doc1_qa', password: 'WrongPassword!' });
    FAIL('Wrong password should be rejected', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Wrong password rejected with 401');
    else FAIL('Wrong password', { status: err.response?.status });
  }

  try {
    console.log('  [1.3] Login doc1_qa with CORRECT password (expect 200 + token)');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: 'doc1_qa', password: SEEDED_STAFF_PASSWORD });
    doctorToken = res.data.access_token;
    if (doctorToken && res.data.role === 'doctor') PASS('Doctor login returned valid token', { role: res.data.role, mode: res.data._meta?.mode });
    else FAIL('Doctor login response malformed', res.data);
  } catch (err) {
    FAIL('Doctor login', { status: err.response?.status, data: err.response?.data });
  }

  try {
    console.log('  [1.4] Login nurse_qa with correct password (expect 200)');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: 'nurse_qa', password: SEEDED_STAFF_PASSWORD });
    nurseToken = res.data.access_token;
    if (nurseToken) PASS('Nurse login succeeded', { role: res.data.role });
    else FAIL('Nurse login', 'No token returned');
  } catch (err) {
    FAIL('Nurse login', { status: err.response?.status });
  }

  try {
    console.log('  [1.5] Login admin_qa with correct password (expect 200)');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: 'admin_qa', password: SEEDED_STAFF_PASSWORD });
    adminToken = res.data.access_token;
    if (adminToken) PASS('Admin login succeeded', { role: res.data.role });
    else FAIL('Admin login', 'No token returned');
  } catch (err) {
    FAIL('Admin login', { status: err.response?.status });
  }

  try {
    console.log('  [1.6] /auth/me with valid doctor token (expect 200)');
    const res = await axios.get(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${doctorToken}` } });
    if (res.data.id === 'doc1_qa') PASS('/auth/me returns correct identity', res.data);
    else FAIL('/auth/me identity mismatch', res.data);
  } catch (err) {
    FAIL('/auth/me with valid token', err.response?.data);
  }

  try {
    console.log('  [1.7] /auth/me with invalid token (expect 401)');
    await axios.get(`${API_BASE}/auth/me`, { headers: { Authorization: 'Bearer fake.token.here' } });
    FAIL('/auth/me with invalid token should fail', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Invalid token rejected with 401');
    else FAIL('/auth/me invalid token', err.response?.status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2: ROLE-BASED ACCESS CONTROL
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[2] Role-Based Access Control\n');

  try {
    console.log('  [2.1] Nurse accessing Doctor-only endpoint — create note (expect 403)');
    await axios.post(`${API_BASE}/notes`, { patientId: 'pat-1' }, { headers: { Authorization: `Bearer ${nurseToken}` } });
    FAIL('Nurse should not create notes', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 403) PASS('Nurse denied note creation (403)');
    else FAIL('Nurse note creation RBAC', { status: err.response?.status });
  }

  try {
    console.log('  [2.2] Doctor accessing Admin-only endpoint — list users (expect 403)');
    await axios.get(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${doctorToken}` } });
    FAIL('Doctor should not access admin users', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 403) PASS('Doctor denied admin/users (403)');
    else FAIL('Doctor admin access RBAC', { status: err.response?.status });
  }

  try {
    console.log('  [2.3] No token — accessing queue (expect 401)');
    await axios.get(`${API_BASE}/queue`);
    FAIL('Unauthenticated queue access should fail', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Unauthenticated access denied (401)');
    else FAIL('Unauthenticated queue access', err.response?.status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3: BREAK-GLASS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[3] Break-Glass\n');

  try {
    console.log('  [3.1] Break-glass without justification (expect 400)');
    await axios.post(`${API_BASE}/patients/pat-1/break-glass`,
      { justification: 'short' },
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );
    FAIL('Short justification should fail', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 400) PASS('Short justification rejected (400)');
    else FAIL('Break-glass justification validation', err.response?.status);
  }

  try {
    console.log('  [3.2] Valid break-glass from doctor (expect 200 + granted)');
    const res = await axios.post(`${API_BASE}/patients/pat-1/break-glass`,
      { justification: 'Emergency cardiac event, patient unconscious, accessing notes for treatment.' },
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );
    if (res.data.granted === true) PASS('Break-glass granted with proper justification', { actor: res.data.actor });
    else FAIL('Break-glass response malformed', res.data);
  } catch (err) {
    FAIL('Valid break-glass', err.response?.data);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4: SEED-RESET SECURITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[4] Internal Seed-Reset Security\n');

  try {
    console.log('  [4.1] Seed-reset without auth (expect 401)');
    await axios.post(`${API_BASE}/internal/seed-reset`);
    FAIL('Unauthenticated seed-reset should fail', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Unauthenticated seed-reset denied (401)');
    else FAIL('Seed-reset no-auth', err.response?.status);
  }

  try {
    console.log('  [4.2] Seed-reset with doctor token (expect 403 — not ADMIN)');
    await axios.post(`${API_BASE}/internal/seed-reset`, {}, { headers: { Authorization: `Bearer ${doctorToken}` } });
    FAIL('Doctor token should not be allowed to seed-reset', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 403) PASS('Non-admin seed-reset denied (403)');
    else FAIL('Seed-reset non-admin', err.response?.status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5: OCC — NOTES
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[5] OCC — Clinical Notes\n');

  let noteId;
  try {
    console.log('  [5.1] Create note for pat-2');
    const res = await axios.post(`${API_BASE}/notes`, { patientId: 'pat-2', draft_content: 'Test note' }, { headers: { Authorization: `Bearer ${doctorToken}` } });
    noteId = res.data.noteId;
    if (noteId) PASS('Note created', { noteId, version: res.data.newVersion });
    else FAIL('Note creation', res.data);
  } catch (err) {
    FAIL('Note creation', err.response?.data);
  }

  if (noteId) {
    try {
      console.log('  [5.2] Update note with wrong version (expect 409)');
      await axios.put(`${API_BASE}/notes/${noteId}`, { draft_content: 'Updated', version: 999 }, { headers: { Authorization: `Bearer ${doctorToken}` } });
      FAIL('Stale version should trigger 409', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 409) PASS('Note OCC stale version rejected (409)');
      else FAIL('Note OCC', err.response?.status);
    }

    try {
      console.log('  [5.3] Update note with correct version (expect 200)');
      const res = await axios.put(`${API_BASE}/notes/${noteId}`, { draft_content: 'Updated content', version: 1 }, { headers: { Authorization: `Bearer ${doctorToken}` } });
      if (res.data.newVersion === 2) PASS('Note updated, version incremented', { v: res.data.newVersion });
      else FAIL('Note update version', res.data);
    } catch (err) {
      FAIL('Note update correct version', err.response?.data);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 6: OCC — PRESCRIPTIONS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[6] OCC — Prescriptions\n');

  let rxId;
  try {
    console.log('  [6.1] Create prescription for pat-2');
    const res = await axios.post(`${API_BASE}/prescriptions`, { patientId: 'pat-2', rx_content: 'Test Rx' }, { headers: { Authorization: `Bearer ${doctorToken}` } });
    rxId = res.data.rxId;
    if (rxId) PASS('Prescription created', { rxId });
    else FAIL('Prescription creation', res.data);
  } catch (err) {
    FAIL('Prescription creation', err.response?.data);
  }

  if (rxId) {
    try {
      console.log('  [6.2] Update prescription with wrong version (expect 409)');
      await axios.put(`${API_BASE}/prescriptions/${rxId}`, { rx_content: 'New content', version: 999 }, { headers: { Authorization: `Bearer ${doctorToken}` } });
      FAIL('Stale Rx version should trigger 409', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 409) PASS('Prescription OCC stale version rejected (409)');
      else FAIL('Prescription OCC', err.response?.status);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 7: ADMIN USER LIFECYCLE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[7] Admin User Lifecycle\n');

  try {
    console.log('  [7.1] List users as ADMIN (expect 200)');
    const res = await axios.get(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (Array.isArray(res.data) && res.data.length > 0) PASS('Admin user list returned', { count: res.data.length });
    else FAIL('Admin user list empty or malformed', res.data);
  } catch (err) {
    FAIL('Admin user list', err.response?.data);
  }

  try {
    console.log('  [7.2] Create new test staff user');
    const res = await axios.post(`${API_BASE}/admin/users`,
      { id: 'test_staff_verify', role: 'NURSE', name: 'Test Nurse Verify', password: 'VerifyNurse2026!' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (res.data.created) PASS('New staff user created', { userId: res.data.userId });
    else FAIL('User creation response', res.data);
  } catch (err) {
    FAIL('Admin create user', err.response?.data);
  }

  try {
    console.log('  [7.3] Verify new user can login');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: 'test_staff_verify', password: 'VerifyNurse2026!' });
    if (res.data.access_token) PASS('Newly created user can login', { role: res.data.role });
    else FAIL('New user login', res.data);
  } catch (err) {
    FAIL('New user login', err.response?.data);
  }

  try {
    console.log('  [7.4] Disable the test user');
    const res = await axios.patch(`${API_BASE}/admin/users/test_staff_verify/disable`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (res.data.disabled) PASS('User disabled', res.data);
    else FAIL('User disable', res.data);
  } catch (err) {
    FAIL('Admin disable user', err.response?.data);
  }

  try {
    console.log('  [7.5] Disabled user cannot login (expect 401)');
    await axios.post(`${API_BASE}/auth/login`, { username: 'test_staff_verify', password: 'VerifyNurse2026!' });
    FAIL('Disabled user should not be able to login', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('Disabled user login rejected (401)');
    else FAIL('Disabled user login', err.response?.status);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 8: HEALTH CHECK
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[8] Health Check\n');

  try {
    const res = await axios.get(`${API_BASE}/health`);
    if (res.data.status === 'ok') PASS('Health endpoint responded', { env: res.data.env, db: res.data.db });
    else FAIL('Health check malformed', res.data);
  } catch (err) {
    FAIL('Health check', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`  RESULTS: ${pass} PASSED / ${fail} FAILED`);
  if (fail === 0) {
    console.log('  ALL VERIFICATIONS PASSED');
  } else {
    console.log(`  ${fail} VERIFICATION(S) FAILED — review output above`);
  }
  console.log('================================================================\n');

  if (fail > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('[FATAL] Verification suite crashed:', err.message);
  process.exit(1);
});
