const { run, resetAndSeedDatabase } = require('../database');
const { SEEDED_PASSWORD, seedDatabase } = require('../seed');

/**
 * DEPLOY SEED — Restricted Web Pilot (Phase 2)
 *
 * WARNING: DESTRUCTIVE. Drops and recreates all tables.
 * Run ONCE before first pilot start, or to fully reset a test environment.
 *
 * USAGE:
 *   node scripts/deploy-seed.js --confirm-destroy
 *
 * Phase 2 additions:
 *   - patient_qa: pre-activated PATIENT account linked to pat-1 (John Doe)
 *     Login: patient_qa / Password123!
 *   - pat-2 (Jane Smith) gets a long-lived test OTP: 123456
 *     Use via /patient/activate to test the full activation flow
 *   - pat-3 (Ramesh Sivakumar) remains unactivated (no token, no account)
 */

const args = process.argv.slice(2);

if (!args.includes('--confirm-destroy')) {
  console.error('');
  console.error('[ SAFETY BLOCK ] This script will DROP ALL TABLES and recreate the schema.');
  console.error('[ SAFETY BLOCK ] All existing data will be permanently deleted.');
  console.error('');
  console.error('To proceed:');
  console.error('   node scripts/deploy-seed.js --confirm-destroy');
  console.error('');
  process.exit(1);
}

async function runDeploySeed() {
  console.log('[SEED] Building Core Schema (DESTRUCTIVE — confirmed)...');
  await resetAndSeedDatabase({ skipDataSeed: true });

  console.log('[SEED] Provisioning base verification dataset...');
  await seedDatabase({ run, dialect: process.env.DB_DIALECT || 'sqlite' });

  // ── Phase 2: Pending activation token for pat-2 (Jane Smith) ─────────────
  // Long-lived (1 year) so QA doesn't need to regenerate constantly.
  // OTP: 123456 — document this clearly, change in real pilot.
  console.log('[SEED] Provisioning test activation token for pat-2...');
  const testOtpExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  await run(
    `INSERT INTO patient_activation_tokens (patient_id, otp, expires_at) VALUES ('pat-2', '123456', ?)`,
    [testOtpExpiry]
  );

  // ── Seed notifications ────────────────────────────────────────────────────
  console.log('[SEED] Seeding initial notifications...');
  await run(
    `INSERT INTO notifications (type, title, body, patient_id, actor_id, target_role, read)
     VALUES ('critical', 'Critical Lab: Potassium', 'John Doe — K+ 6.2 mEq/L (Critical High). Immediate review required.', 'pat-1', 'SYSTEM', NULL, 0)`
  );
  await run(
    `INSERT INTO notifications (type, title, body, patient_id, actor_id, target_role, read)
     VALUES ('info', 'Triage Complete', 'Nurse completed triage for Jane Smith. EWS: L4 — Less Urgent.', 'pat-2', 'nurse_qa', 'DOCTOR', 0)`
  );
  await run(
    `INSERT INTO notifications (type, title, body, patient_id, actor_id, target_role, read)
     VALUES ('info', 'New Patient Check-In', 'Ramesh Sivakumar has checked in at reception.', 'pat-3', 'nurse_qa', NULL, 1)`
  );

  console.log('');
  console.log('[SEED] ✓ Pilot accounts provisioned successfully.');
  console.log('');
  console.log(`[SEED] Staff accounts (password: ${SEEDED_PASSWORD}):`);
  console.log('  nurse_qa    NURSE');
  console.log('  doc1_qa     DOCTOR');
  console.log('  doc2_qa     DOCTOR');
  console.log('  admin_qa    ADMIN');
  console.log('');
  console.log('[SEED] Patient accounts:');
  console.log(`  patient_qa  PATIENT  → linked to pat-1 (John Doe)    — pre-activated, password: ${SEEDED_PASSWORD}`);
  console.log('  [none]      PATIENT  → pat-2 (Jane Smith)            — pending activation, OTP: 123456');
  console.log('  [none]      PATIENT  → pat-3 (Ramesh Sivakumar)      — no activation token');
  console.log('');
  console.log('[SEED] REMINDER: Rotate all passwords immediately in a real pilot.');
  process.exit(0);
}

runDeploySeed().catch(err => {
  console.error('[SEED] Fatal error:', err);
  process.exit(1);
});
