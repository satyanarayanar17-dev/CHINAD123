const { run } = require('../database');
const { SEEDED_PASSWORD, seedDatabase } = require('../seed');

/**
 * APPEND SEED — Idempotent, non-destructive
 *
 * Safe to run against any database state — seeded users are repaired,
 * and existing clinical seed rows are otherwise skipped.
 * Use this to populate a fresh schema without destroying existing data,
 * or to add the test patient user for portal development.
 *
 * USAGE:
 *   node scripts/append-seed.js
 *
 * What this seeds:
 *   - 4 staff users (nurse_qa, doc1_qa, doc2_qa, admin_qa)
 *   - 3 test patients
 *   - 3 encounters
 *   - 1 clinical note, 1 prescription
 *   - 1 pre-linked patient portal user (patient_qa → pat-1) for portal testing
 */

async function runAppendSeed() {
  console.log('[SEED:APPEND] Starting idempotent append seed...');
  await seedDatabase({ run, dialect: process.env.DB_DIALECT || 'sqlite' });

  console.log('');
  console.log(`[SEED:APPEND] Done. Credentials (password: ${SEEDED_PASSWORD}):`);
  console.log('  Staff  — nurse_qa, doc1_qa, doc2_qa, admin_qa');
  console.log('  Patient — patient_qa  (linked to pat-1: John Doe)');
  console.log('');
  process.exit(0);
}

runAppendSeed().catch(err => {
  console.error('[SEED:APPEND] Failed:', err);
  process.exit(1);
});
