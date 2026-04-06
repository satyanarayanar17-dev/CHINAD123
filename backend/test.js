const request = require('supertest');
const app = require('./server');
const jwt = require('jsonwebtoken');
const assert = require('assert');

const mockDocToken = jwt.sign({ id: 'doc1_qa', role: 'DOCTOR' }, process.env.JWT_SECRET || 'pilot-beta-secure-secret-key');
const mockNurseToken = jwt.sign({ id: 'nurse_qa', role: 'NURSE' }, process.env.JWT_SECRET || 'pilot-beta-secure-secret-key');

async function runVerification() {
  console.log('--- STARTING HOSTILE BACKEND VERIFICATION ---');

  // 1. Seed Database
  const seedRes = await request(app).post('/api/internal/seed-reset');
  assert.strictEqual(seedRes.status, 200, 'Seed should succeed');

  // 2. Auth Boundary Test: Nurse attempting to update Note
  const nurseRes = await request(app)
    .put('/api/notes/note-unknown')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ draft_content: 'bypassing', version: 1 });
  
  assert.strictEqual(nurseRes.status, 403, 'A nurse must receive 403 forbidden when calling doctor endpoints.');
  console.log('✅ PASS: Cross-role 403 blocked successfully.');

  // 3. Queue OCC Collision Test
  const qRes1 = await request(app)
    .patch('/api/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 });
  
  assert.strictEqual(qRes1.status, 200, 'First sequential patch should pass');

  const qRes2 = await request(app)
    .patch('/api/queue/enc-1')
    .set('Authorization', `Bearer ${mockNurseToken}`)
    .send({ phase: 'DOCTOR_REVIEW', version: 1 }); // Trying version 1 again
  
  assert.strictEqual(qRes2.status, 409, 'Concurrent patch with stale version must receive 409 Conflict.');
  console.log('✅ PASS: OCC 409 Collision blocked successfully.');

  // 4. State Dependency Guard: Discharging with active draft
  // First insert a dummy note draft
  const { run } = require('./database');
  await run(`INSERT INTO clinical_notes (id, encounter_id, draft_content, status, __v) VALUES ('test-note', 'enc-2', 'draft', 'DRAFT', 1)`);

  const dischargeRes = await request(app)
    .patch('/api/encounters/enc-2/discharge')
    .set('Authorization', `Bearer ${mockDocToken}`);
  
  assert.strictEqual(dischargeRes.status, 409, 'Must block discharge if active drafts exist');
  console.log('✅ PASS: Discharge state-dependency check blocked successfully.');

  console.log('--- ALL VERIFICATION TESTS PASSED ---');
  process.exit(0);
}

runVerification().catch(e => {
  console.error('❌ FAIL', e);
  process.exit(1);
});
