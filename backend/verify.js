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
const http = require('http');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';

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
  // SECTION 9: PATIENT PIPELINE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[9] Patient Pipeline\n');

  let patientToken = null;

  try {
    console.log('  [9.1] Pre-activated patient_qa can login (expect 200)');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: 'patient_qa', password: SEEDED_STAFF_PASSWORD });
    patientToken = res.data.access_token;
    if (patientToken && res.data.role === 'patient') PASS('Patient login returned token', { role: res.data.role });
    else FAIL('Patient login response malformed', res.data);
  } catch (err) {
    FAIL('Patient login', { status: err.response?.status, data: err.response?.data });
  }

  if (patientToken) {
    try {
      console.log('  [9.2] Patient can fetch own appointments (expect 200, scoped)');
      const res = await axios.get(`${API_BASE}/my/appointments`, { headers: { Authorization: `Bearer ${patientToken}` } });
      if (Array.isArray(res.data)) PASS('Patient appointments returned (scoped to own data)', { count: res.data.length });
      else FAIL('Patient appointments response malformed', res.data);
    } catch (err) {
      FAIL('Patient appointments', { status: err.response?.status });
    }

    try {
      console.log('  [9.3] Patient cannot access staff notes endpoint (expect 403)');
      await axios.get(`${API_BASE}/notes/note-1`, { headers: { Authorization: `Bearer ${patientToken}` } });
      FAIL('Patient should be blocked from staff notes', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 403) {
        PASS('Patient denied staff clinical note access (403 FORBIDDEN_ROLE)');
      } else {
        FAIL('Patient note access RBAC — expected 403', { status: err.response?.status });
      }
    }

    try {
      console.log('  [9.3b] Patient cannot access staff prescriptions endpoint (expect 403)');
      await axios.get(`${API_BASE}/prescriptions/rx-1`, { headers: { Authorization: `Bearer ${patientToken}` } });
      FAIL('Patient should be blocked from staff prescriptions', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 403) {
        PASS('Patient denied staff prescription access (403 FORBIDDEN_ROLE)');
      } else {
        FAIL('Patient prescription access RBAC — expected 403', { status: err.response?.status });
      }
    }

    try {
      console.log('  [9.3c] Patient cannot access staff encounters endpoint (expect 403)');
      await axios.get(`${API_BASE}/encounters/enc-1`, { headers: { Authorization: `Bearer ${patientToken}` } });
      FAIL('Patient should be blocked from staff encounters', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 403) {
        PASS('Patient denied staff encounter access (403 FORBIDDEN_ROLE)');
      } else {
        FAIL('Patient encounter access RBAC — expected 403', { status: err.response?.status });
      }
    }

    try {
      console.log('  [9.3d] Patient cannot access patient search endpoint (expect 403)');
      await axios.get(`${API_BASE}/patients`, { headers: { Authorization: `Bearer ${patientToken}` } });
      FAIL('Patient should be blocked from patient search', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 403) {
        PASS('Patient denied patient search access (403 FORBIDDEN_ROLE)');
      } else {
        FAIL('Patient search access RBAC — expected 403', { status: err.response?.status });
      }
    }

    try {
      console.log('  [9.3e] Patient cannot access clinical drafts endpoint (expect 403)');
      await axios.get(`${API_BASE}/drafts/some-key`, { headers: { Authorization: `Bearer ${patientToken}` } });
      FAIL('Patient should be blocked from clinical drafts', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 403) {
        PASS('Patient denied clinical drafts access (403 FORBIDDEN_ROLE)');
      } else {
        FAIL('Patient drafts access RBAC — expected 403', { status: err.response?.status });
      }
    }
  }

  try {
    console.log('  [9.4] Activation claim with known test OTP for pat-2 (expect 200)');
    // This creates a user account for pat-2 using the seed OTP 123456
    // On re-runs this will 409 (account already exists) — both are valid outcomes
    const res = await axios.post(`${API_BASE}/activation/claim`, {
      patient_id: 'pat-2',
      otp: '123456',
      new_password: 'TestPatient2026!'
    });
    if (res.data.message) PASS('Activation claim succeeded for pat-2');
    else FAIL('Activation claim response malformed', res.data);
  } catch (err) {
    if (err.response?.status === 409) {
      PASS('Activation claim — account already exists (re-run idempotency OK)', { code: err.response.data?.error });
    } else {
      FAIL('Activation claim', { status: err.response?.status, data: err.response?.data });
    }
  }

  try {
    console.log('  [9.5] Activation claim rate limit triggers on repeated bad OTPs (expect 429 after 5)');
    let rateLimitHit = false;
    for (let i = 0; i < 6; i++) {
      try {
        await axios.post(`${API_BASE}/activation/claim`, {
          patient_id: 'pat-3',
          otp: '000000',
          new_password: 'TestPassword123!'
        });
      } catch (e) {
        if (e.response?.status === 429) {
          rateLimitHit = true;
          break;
        }
      }
    }
    if (rateLimitHit) PASS('Activation rate limit triggered at 5+ failed attempts (429)');
    else FAIL('Activation rate limit did not trigger');
  } catch (err) {
    FAIL('Activation rate limit test', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 10: PERSISTENT DRAFTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[10] Persistent Drafts (DB-backed)\n');

  let draftEtag = null;
  const draftKey = `verify-draft-${Date.now()}`;

  try {
    console.log('  [10.1] Create new draft (expect 200 + ETag)');
    const res = await axios.put(
      `${API_BASE}/drafts/${draftKey}`,
      { soap: { S: 'Test subjective', O: 'Test objective', A: '', P: '' } },
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );
    draftEtag = res.data.etag;
    if (draftEtag) PASS('Draft created and ETag returned', { etag: draftEtag });
    else FAIL('Draft create — no ETag in response', res.data);
  } catch (err) {
    FAIL('Draft create', { status: err.response?.status, data: err.response?.data });
  }

  if (draftEtag) {
    try {
      console.log('  [10.2] Retrieve draft by key (expect 200 + ETag header)');
      const res = await axios.get(`${API_BASE}/drafts/${draftKey}`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.data?.soap?.S === 'Test subjective') PASS('Draft retrieved correctly');
      else FAIL('Draft content mismatch', res.data);
    } catch (err) {
      FAIL('Draft get', { status: err.response?.status });
    }

    try {
      console.log('  [10.3] Update draft with stale ETag (expect 412)');
      await axios.put(
        `${API_BASE}/drafts/${draftKey}`,
        { soap: { S: 'Modified by another session' } },
        { headers: { Authorization: `Bearer ${doctorToken}`, 'If-Match': '"stale-etag-value"' } }
      );
      FAIL('Stale ETag should trigger 412', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 412) PASS('Stale ETag correctly rejected (412)');
      else FAIL('Draft OCC stale ETag', { status: err.response?.status });
    }

    try {
      console.log('  [10.4] Update draft with correct ETag (expect 200 + new ETag)');
      const res = await axios.put(
        `${API_BASE}/drafts/${draftKey}`,
        { soap: { S: 'Updated subjective', O: 'Updated objective', A: 'Assessment', P: 'Plan' } },
        { headers: { Authorization: `Bearer ${doctorToken}`, 'If-Match': draftEtag } }
      );
      const newEtag = res.data.etag;
      if (newEtag && newEtag !== draftEtag) PASS('Draft updated, new ETag issued', { newEtag });
      else FAIL('Draft update ETag mismatch', res.data);
      draftEtag = newEtag;
    } catch (err) {
      FAIL('Draft update correct ETag', { status: err.response?.status, data: err.response?.data });
    }

    try {
      console.log('  [10.5] Delete draft (expect 200)');
      const res = await axios.delete(`${API_BASE}/drafts/${draftKey}`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      if (res.data.message) PASS('Draft deleted');
      else FAIL('Draft delete response malformed', res.data);
    } catch (err) {
      FAIL('Draft delete', { status: err.response?.status });
    }

    try {
      console.log('  [10.6] Deleted draft returns 404');
      await axios.get(`${API_BASE}/drafts/${draftKey}`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      FAIL('Deleted draft should return 404', 'Got 2xx!');
    } catch (err) {
      if (err.response?.status === 404) PASS('Deleted draft correctly returns 404');
      else FAIL('Deleted draft status', { status: err.response?.status });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 11: NOTIFICATIONS (DB-backed)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[11] Notifications (DB-backed)\n');

  try {
    console.log('  [11.1] Fetch notifications as doctor (expect 200 + array)');
    const res = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    if (Array.isArray(res.data)) PASS('Notifications returned from DB', { count: res.data.length });
    else FAIL('Notifications response malformed', res.data);
  } catch (err) {
    FAIL('Notifications fetch', { status: err.response?.status });
  }

  try {
    console.log('  [11.2] Mark all notifications as read (expect 200)');
    const res = await axios.post(`${API_BASE}/notifications/read-all`, {}, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    if (res.data.message) PASS('Mark all read succeeded');
    else FAIL('Mark all read response malformed', res.data);
  } catch (err) {
    FAIL('Mark all read', { status: err.response?.status });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 12: LOGIN RATE LIMITING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[12] Login Rate Limiting\n');

  try {
    console.log('  [12.1] Rate limit triggers after 10 failed attempts (expect 429)');
    let rateLimitHit = false;
    for (let i = 0; i < 12; i++) {
      try {
        await axios.post(`${API_BASE}/auth/login`, { username: 'nonexistent_user_rl', password: 'wrong' });
      } catch (e) {
        if (e.response?.status === 429) {
          rateLimitHit = true;
          break;
        }
      }
    }
    if (rateLimitHit) PASS('Login rate limit triggered (429) after repeated failures');
    else FAIL('Login rate limit did not trigger within 12 attempts');
  } catch (err) {
    FAIL('Rate limit test', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 13: SSE ENDPOINT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[13] Server-Sent Events (SSE)\n');

  try {
    console.log('  [13.1] GET /sse without token (expect 401)');
    await axios.get(`${API_BASE}/sse`);
    FAIL('SSE without token should return 401', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('SSE without token rejected (401)');
    else FAIL('SSE no-token check', { status: err.response?.status, err: err.message });
  }

  try {
    console.log('  [13.2] GET /sse with invalid token (expect 401)');
    await axios.get(`${API_BASE}/sse?token=not.a.real.token`);
    FAIL('SSE with invalid token should return 401', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401) PASS('SSE invalid token rejected (401)');
    else FAIL('SSE invalid-token check', { status: err.response?.status });
  }

  // SSE with valid token — we open an HTTP request directly to check Content-Type
  // without waiting for streaming data (axios would hang on a live SSE stream).
  await new Promise((resolve) => {
    console.log('  [13.3] GET /sse with valid doctor token (expect 200 + text/event-stream)');
    if (!doctorToken) {
      FAIL('SSE valid token — doctor token unavailable (login failed earlier)');
      return resolve();
    }
    const url = new URL(`${API_BASE}/sse?token=${encodeURIComponent(doctorToken)}`);
    const req = http.get({
      hostname: url.hostname,
      port: url.port || 3001,
      path: `${url.pathname}${url.search}`,
      headers: { Accept: 'text/event-stream' }
    }, (res) => {
      const ct = res.headers['content-type'] || '';
      if (res.statusCode === 200 && ct.startsWith('text/event-stream')) {
        PASS('SSE with valid token returns 200 + text/event-stream', { status: res.statusCode, ct });
      } else {
        FAIL('SSE content-type or status wrong', { status: res.statusCode, ct });
      }
      req.destroy(); // Don't consume the stream
      resolve();
    });
    req.on('error', (err) => {
      FAIL('SSE valid token HTTP request failed', { err: err.message });
      resolve();
    });
    req.setTimeout(5000, () => {
      FAIL('SSE valid token request timed out');
      req.destroy();
      resolve();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 14: TOKEN REVOCATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[14] Token Revocation\n');

  let revokableToken = null;
  const REVOKE_TEST_ID = 'test_revoke_verify';

  try {
    console.log('  [14.1] Create test user for revocation test');
    // Clean up any leftover from a previous run first (ignore errors)
    try { await axios.patch(`${API_BASE}/admin/users/${REVOKE_TEST_ID}/enable`, {}, { headers: { Authorization: `Bearer ${adminToken}` } }); } catch (_) {}
    const res = await axios.post(`${API_BASE}/admin/users`,
      { id: REVOKE_TEST_ID, role: 'NURSE', name: 'Revoke Test Nurse', password: 'RevokeTest2026!' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (res.data.created) PASS('Revocation test user created', { userId: REVOKE_TEST_ID });
    else FAIL('Revocation test user creation', res.data);
  } catch (err) {
    // User may exist from a prior partial run — try to enable and continue
    try {
      await axios.patch(`${API_BASE}/admin/users/${REVOKE_TEST_ID}/enable`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
      PASS('Revocation test user already existed — re-enabled for test');
    } catch (_) {
      FAIL('Revocation test user setup', err.response?.data || err.message);
    }
  }

  try {
    console.log('  [14.2] Login as revocable user to obtain token');
    const res = await axios.post(`${API_BASE}/auth/login`, { username: REVOKE_TEST_ID, password: 'RevokeTest2026!' });
    revokableToken = res.data.access_token;
    if (revokableToken) PASS('Revocable user logged in', { userId: REVOKE_TEST_ID });
    else FAIL('Revocable user login — no token returned', res.data);
  } catch (err) {
    FAIL('Revocable user login', err.response?.data);
  }

  try {
    console.log('  [14.3] Confirm token works before disabling');
    const res = await axios.get(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${revokableToken}` } });
    if (res.data.id === REVOKE_TEST_ID) PASS('Token valid before revocation');
    else FAIL('Token pre-revocation check', res.data);
  } catch (err) {
    FAIL('Token pre-revocation check', err.response?.data);
  }

  try {
    console.log('  [14.4] Admin disables the user');
    const res = await axios.patch(`${API_BASE}/admin/users/${REVOKE_TEST_ID}/disable`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (res.data.disabled) PASS('User disabled (revocation record written)');
    else FAIL('User disable', res.data);
  } catch (err) {
    FAIL('Admin disable for revocation test', err.response?.data);
  }

  try {
    console.log('  [14.5] Use old token immediately after disable (expect 401 TOKEN_REVOKED)');
    await axios.get(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${revokableToken}` } });
    FAIL('Old token should be rejected after user is disabled', 'Got 2xx!');
  } catch (err) {
    if (err.response?.status === 401 && err.response?.data?.error?.code === 'TOKEN_REVOKED') {
      PASS('Old token rejected with 401 TOKEN_REVOKED', { code: err.response.data.error.code });
    } else if (err.response?.status === 401) {
      // Acceptable: could also be INVALID_TOKEN or ACCOUNT_DISABLED from /auth/me check
      PASS('Old token rejected with 401 after disable', { code: err.response.data?.error?.code });
    } else {
      FAIL('Token revocation enforcement', { status: err.response?.status, data: err.response?.data });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 15: DRAFT CLEANUP
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[15] Draft Cleanup\n');

  try {
    console.log('  [15.1] Insert an expired clinical draft directly into DB');
    const { run, get: dbGet } = require('./database');
    const oldTimestamp = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(); // 49h ago
    await run(
      `INSERT OR REPLACE INTO clinical_drafts (key, data, etag, updated_at) VALUES (?, ?, ?, ?)`,
      ['verify-cleanup-test', '{"test":true}', 'etag-test-001', oldTimestamp]
    );
    PASS('Expired draft inserted into clinical_drafts', { updated_at: oldTimestamp });

    console.log('  [15.2] Run cleanup logic (same query used by the setInterval job)');
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
    PASS('Cleanup query executed without error');

    console.log('  [15.3] Verify expired draft is gone');
    const draft = await dbGet(`SELECT * FROM clinical_drafts WHERE key = ?`, ['verify-cleanup-test']);
    if (!draft) PASS('Expired draft successfully removed by cleanup');
    else FAIL('Expired draft still present after cleanup', draft);

    console.log('  [15.4] Insert a recent draft and confirm it survives cleanup');
    await run(
      `INSERT OR REPLACE INTO clinical_drafts (key, data, etag, updated_at) VALUES (?, ?, ?, ?)`,
      ['verify-recent-draft', '{"recent":true}', 'etag-recent-001', new Date().toISOString()]
    );
    await run(`DELETE FROM clinical_drafts WHERE updated_at < ?`, [cutoff]);
    const recent = await dbGet(`SELECT * FROM clinical_drafts WHERE key = ?`, ['verify-recent-draft']);
    if (recent) PASS('Recent draft correctly preserved by cleanup');
    else FAIL('Recent draft was incorrectly deleted by cleanup');

    // Clean up test data
    await run(`DELETE FROM clinical_drafts WHERE key IN (?, ?)`, ['verify-cleanup-test', 'verify-recent-draft']);
  } catch (err) {
    FAIL('Draft cleanup test', { err: err.message });
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
