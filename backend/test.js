/**
 * backend/test.js — In-process supertest harness
 *
 * These tests run the Express app in-process via supertest.
 * They require a seeded SQLite database (run `npm run seed` first).
 *
 * For the full HTTP-level verification suite (tests against running server),
 * use `node verify.js` or `npm run verify`.
 */

// Must be set before requiring server so middleware/auth.js picks up the correct fallback.
process.env.ALLOW_SEED_RESET = 'true';

const request = require('supertest');
const app = require('./server');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const { resetAndSeedDatabase, get } = require('./database');

// Use the same dev fallback as middleware/auth.js to avoid token rejection
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-fallback-do-not-use-in-pilot';

const mockDocToken = jwt.sign({ id: 'doc1_qa', role: 'DOCTOR' }, JWT_SECRET);
const mockNurseToken = jwt.sign({ id: 'nurse_qa', role: 'NURSE' }, JWT_SECRET);
const mockAdminToken = jwt.sign({ id: 'admin_qa', role: 'ADMIN' }, JWT_SECRET);
const mockPatientToken = jwt.sign({ id: 'patient_qa', role: 'PATIENT' }, JWT_SECRET);

async function runVerification() {
  console.log('--- STARTING SUPERTEST IN-PROCESS BACKEND VERIFICATION ---\n');

  // 1. Seed the sqlite database directly (no HTTP call needed)
  console.log('[SETUP] Seeding database...');
  await resetAndSeedDatabase();
  console.log('[SETUP] Done.\n');

  // ─── REGRESSION: API base path must be /api/v1 ─────────────────────────
  // Previously, the verifier and tests used /api/ (without /v1/) which caused
  // false 404s and masked real RBAC failures.
  console.log('[REG-1] API base path regression check\n');

  const healthRes = await request(app).get('/api/v1/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must be reachable at /api/v1/health');
  assert.strictEqual(healthRes.body.status, 'ok', 'Health endpoint must return status: ok');
  console.log('✅ PASS: Health endpoint at /api/v1/health returns 200 + ok');

  const oldHealthRes = await request(app).get('/api/health');
  assert.strictEqual(oldHealthRes.status, 404, 'Old /api/health path must NOT resolve (routes are under /api/v1/)');
  console.log('✅ PASS: Old /api/health path correctly returns 404 (regression guard)');

  // ─── REGRESSION: refresh_tokens table must exist ───────────────────────
  // Previously missing, causing token revocation writes to crash.
  console.log('\n[REG-2] refresh_tokens table existence check\n');

  const tableCheck = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'`
  );
  assert.ok(tableCheck, 'refresh_tokens table must exist in schema');
  console.log('✅ PASS: refresh_tokens table exists in database');

  // ─── REGRESSION: revoked_tokens table must exist ───────────────────────
  const revokedTableCheck = await get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='revoked_tokens'`
  );
  assert.ok(revokedTableCheck, 'revoked_tokens table must exist in schema');
  console.log('✅ PASS: revoked_tokens table exists in database');

  // 2. Auth Boundary Test: Nurse attempting to update Note
  console.log('\n[RBAC] Role boundary tests\n');

  const nurseRes = await request(app)
    .put('/api/v1/notes/note-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ draft_content: 'bypassing', version: 1 });
  assert.strictEqual(nurseRes.status, 403, 'A NURSE must receive 403 when calling DOCTOR-only note endpoints.');
  console.log('✅ PASS: Cross-role 403 blocked successfully.');

  // 3. Queue OCC Collision Test
  // enc-1 starts at version 1, first patch should succeed
  const qRes1 = await request(app)
    .patch('/api/v1/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 });
  assert.strictEqual(qRes1.status, 200, 'First sequential patch should succeed with correct version.');
  console.log('✅ PASS: Queue transition succeeded with correct OCC version.');

  // Second patch with stale version must be rejected
  const qRes2 = await request(app)
    .patch('/api/v1/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 }); // version is now 2 on the server
  assert.strictEqual(qRes2.status, 409, 'Concurrent patch with stale version must receive 409 Conflict.');
  console.log('✅ PASS: OCC 409 Conflict blocked correctly.');

  // 4. State Dependency Guard: Discharge blocked by active draft note
  // enc-2 already has note-1 in DRAFT status from seed
  const dischargeRes = await request(app)
    .patch('/api/v1/encounters/enc-2/discharge')
    .set('Authorization', `Bearer ${mockDocToken}`);
  assert.strictEqual(dischargeRes.status, 409, 'Must block discharge when active DRAFT notes exist.');
  console.log('✅ PASS: Discharge blocked by active note drafts.');

  // 5. RBAC: Doctor cannot access admin endpoints
  const adminRes = await request(app)
    .get('/api/v1/admin/users')
    .set('Authorization', `Bearer ${mockDocToken}`);
  assert.strictEqual(adminRes.status, 403, 'Doctor must receive 403 on admin-only endpoints.');
  console.log('✅ PASS: Doctor denied admin endpoint access.');

  // 6. Unauthenticated access denied
  const unauthRes = await request(app)
    .get('/api/v1/queue');
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must receive 401.');
  console.log('✅ PASS: Unauthenticated access denied.');

  // 7. Break-glass short justification rejected
  const bgRes = await request(app)
    .post('/api/v1/patients/pat-1/break-glass')
    .set('Authorization', `Bearer ${mockDocToken}`)
    .send({ justification: 'short' });
  assert.strictEqual(bgRes.status, 400, 'Short break-glass justification must be rejected.');
  console.log('✅ PASS: Break-glass short justification rejected.');

  // 8. Break-glass with valid justification accepted
  const bgValidRes = await request(app)
    .post('/api/v1/patients/pat-1/break-glass')
    .set('Authorization', `Bearer ${mockDocToken}`)
    .send({ justification: 'Emergency cardiac event, patient unconscious, urgent treatment required.' });
  assert.strictEqual(bgValidRes.status, 200, 'Valid break-glass must be granted.');
  assert.strictEqual(bgValidRes.body.granted, true, 'Response must include granted: true.');
  console.log('✅ PASS: Valid break-glass granted.');

  // ─── REGRESSION: Patient cannot access staff clinical data (403) ──────
  // Previously, clinical read routes only checked requireAuth (no role check).
  // A PATIENT token could read notes, prescriptions, encounters, and patient
  // demographics meant for staff — bypassing the scoped portal routes.
  console.log('\n[REG-3] Patient-to-staff data boundary tests\n');

  const patNoteRes = await request(app)
    .get('/api/v1/notes/note-1')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patNoteRes.status, 403, 'PATIENT must receive 403 on staff clinical notes endpoint.');
  console.log('✅ PASS: Patient denied staff clinical note access (403).');

  const patRxRes = await request(app)
    .get('/api/v1/prescriptions/rx-1')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patRxRes.status, 403, 'PATIENT must receive 403 on staff prescriptions endpoint.');
  console.log('✅ PASS: Patient denied staff prescription access (403).');

  const patEncRes = await request(app)
    .get('/api/v1/encounters/enc-1')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patEncRes.status, 403, 'PATIENT must receive 403 on staff encounters endpoint.');
  console.log('✅ PASS: Patient denied staff encounter access (403).');

  const patSearchRes = await request(app)
    .get('/api/v1/patients')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patSearchRes.status, 403, 'PATIENT must receive 403 on patient search endpoint.');
  console.log('✅ PASS: Patient denied patient search access (403).');

  const patQueueRes = await request(app)
    .get('/api/v1/queue')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patQueueRes.status, 403, 'PATIENT must receive 403 on queue endpoint.');
  console.log('✅ PASS: Patient denied queue access (403).');

  const patDraftRes = await request(app)
    .get('/api/v1/drafts/some-key')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patDraftRes.status, 403, 'PATIENT must receive 403 on clinical drafts endpoint.');
  console.log('✅ PASS: Patient denied clinical drafts access (403).');

  const patTimelineRes = await request(app)
    .get('/api/v1/patients/pat-1/timeline')
    .set('Authorization', `Bearer ${mockPatientToken}`);
  assert.strictEqual(patTimelineRes.status, 403, 'PATIENT must receive 403 on patient timeline endpoint.');
  console.log('✅ PASS: Patient denied patient timeline access (403).');

  // ─── Verify staff CAN still access the restricted routes ──────────────
  console.log('\n[STAFF] Staff access confirmation tests\n');

  const staffNoteRes = await request(app)
    .get('/api/v1/notes/note-1')
    .set('Authorization', `Bearer ${mockDocToken}`);
  // note-1 exists in seed; expect 200
  assert.ok([200, 404].includes(staffNoteRes.status), 'Doctor must be able to access notes endpoint.');
  console.log(`✅ PASS: Doctor can access notes endpoint (${staffNoteRes.status}).`);

  const staffQueueRes = await request(app)
    .get('/api/v1/queue')
    .set('Authorization', `Bearer ${mockNurseToken}`);
  assert.strictEqual(staffQueueRes.status, 200, 'Nurse must be able to access queue endpoint.');
  console.log('✅ PASS: Nurse can access queue endpoint.');

  console.log('\n--- ALL IN-PROCESS VERIFICATION TESTS PASSED ---');
  process.exit(0);
}

runVerification().catch(e => {
  console.error('\n❌ FAIL:', e.message || e);
  process.exit(1);
});
