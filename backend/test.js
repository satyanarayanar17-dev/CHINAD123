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
const { resetAndSeedDatabase } = require('./database');

// Use the same dev fallback as middleware/auth.js to avoid token rejection
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-fallback-do-not-use-in-pilot';

const mockDocToken = jwt.sign({ id: 'doc1_qa', role: 'DOCTOR' }, JWT_SECRET);
const mockNurseToken = jwt.sign({ id: 'nurse_qa', role: 'NURSE' }, JWT_SECRET);
const mockAdminToken = jwt.sign({ id: 'admin_qa', role: 'ADMIN' }, JWT_SECRET);

async function runVerification() {
  console.log('--- STARTING SUPERTEST IN-PROCESS BACKEND VERIFICATION ---\n');

  // 1. Seed the sqlite database directly (no HTTP call needed)
  console.log('[SETUP] Seeding database...');
  await resetAndSeedDatabase();
  console.log('[SETUP] Done.\n');

  // 2. Auth Boundary Test: Nurse attempting to update Note
  const nurseRes = await request(app)
    .put('/api/notes/note-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ draft_content: 'bypassing', version: 1 });
  assert.strictEqual(nurseRes.status, 403, 'A NURSE must receive 403 when calling DOCTOR-only note endpoints.');
  console.log('✅ PASS: Cross-role 403 blocked successfully.');

  // 3. Queue OCC Collision Test
  // enc-1 starts at version 1, first patch should succeed
  const qRes1 = await request(app)
    .patch('/api/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 });
  assert.strictEqual(qRes1.status, 200, 'First sequential patch should succeed with correct version.');
  console.log('✅ PASS: Queue transition succeeded with correct OCC version.');

  // Second patch with stale version must be rejected
  const qRes2 = await request(app)
    .patch('/api/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 }); // version is now 2 on the server
  assert.strictEqual(qRes2.status, 409, 'Concurrent patch with stale version must receive 409 Conflict.');
  console.log('✅ PASS: OCC 409 Conflict blocked correctly.');

  // 4. State Dependency Guard: Discharge blocked by active draft note
  // enc-2 already has note-1 in DRAFT status from seed
  const dischargeRes = await request(app)
    .patch('/api/encounters/enc-2/discharge')
    .set('Authorization', `Bearer ${mockDocToken}`);
  assert.strictEqual(dischargeRes.status, 409, 'Must block discharge when active DRAFT notes exist.');
  console.log('✅ PASS: Discharge blocked by active note drafts.');

  // 5. RBAC: Doctor cannot access admin endpoints
  const adminRes = await request(app)
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${mockDocToken}`);
  assert.strictEqual(adminRes.status, 403, 'Doctor must receive 403 on admin-only endpoints.');
  console.log('✅ PASS: Doctor denied admin endpoint access.');

  // 6. Unauthenticated access denied
  const unauthRes = await request(app)
    .get('/api/queue');
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must receive 401.');
  console.log('✅ PASS: Unauthenticated access denied.');

  // 7. Break-glass short justification rejected
  const bgRes = await request(app)
    .post('/api/patients/pat-1/break-glass')
    .set('Authorization', `Bearer ${mockDocToken}`)
    .send({ justification: 'short' });
  assert.strictEqual(bgRes.status, 400, 'Short break-glass justification must be rejected.');
  console.log('✅ PASS: Break-glass short justification rejected.');

  // 8. Break-glass with valid justification accepted
  const bgValidRes = await request(app)
    .post('/api/patients/pat-1/break-glass')
    .set('Authorization', `Bearer ${mockDocToken}`)
    .send({ justification: 'Emergency cardiac event, patient unconscious, urgent treatment required.' });
  assert.strictEqual(bgValidRes.status, 200, 'Valid break-glass must be granted.');
  assert.strictEqual(bgValidRes.body.granted, true, 'Response must include granted: true.');
  console.log('✅ PASS: Valid break-glass granted.');

  console.log('\n--- ALL IN-PROCESS VERIFICATION TESTS PASSED ---');
  process.exit(0);
}

runVerification().catch(e => {
  console.error('\n❌ FAIL:', e.message || e);
  process.exit(1);
});
