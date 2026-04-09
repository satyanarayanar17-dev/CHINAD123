const bcrypt = require('bcryptjs');
const { run, resetAndSeedDatabase } = require('../database');

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
  await resetAndSeedDatabase();

  console.log('[SEED] Hashing base passwords...');
  const baseHash = await bcrypt.hash('Password123!', 10);

  // ── Clear auto-seeded SQLite dev rows (Postgres starts clean) ────────────
  console.log('[SEED] Clearing auto-seeded dev rows...');
  await run(`DELETE FROM users`);
  await run(`DELETE FROM patients`);
  await run(`DELETE FROM encounters`);
  await run(`DELETE FROM clinical_notes`);
  await run(`DELETE FROM prescriptions`);
  await run(`DELETE FROM patient_activation_tokens`);
  await run(`DELETE FROM notifications`);
  await run(`DELETE FROM clinical_drafts`);

  // ── Staff accounts ────────────────────────────────────────────────────────
  console.log('[SEED] Provisioning staff accounts...');
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('nurse_qa', 'NURSE', 'Nurse QA', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('doc1_qa', 'DOCTOR', 'Doctor One', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('doc2_qa', 'DOCTOR', 'Doctor Two', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('admin_qa', 'ADMIN', 'Admin QA', ?, 1)`, [baseHash]);

  // ── Test patients ─────────────────────────────────────────────────────────
  console.log('[SEED] Provisioning test patients (NO REAL PHI)...');
  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-1', 'John Doe', '1980-01-01', 'Male')`);
  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-2', 'Jane Smith', '1990-05-15', 'Female')`);
  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-3', 'Ramesh Sivakumar', '1975-03-22', 'Male')`);

  // ── Phase 2: Pre-activated patient account (pat-1 / John Doe) ────────────
  console.log('[SEED] Provisioning pre-activated patient account...');
  await run(
    `INSERT INTO users (id, role, name, password_hash, is_active, patient_id)
     VALUES ('patient_qa', 'PATIENT', 'John Doe', ?, 1, 'pat-1')`,
    [baseHash]
  );

  // ── Phase 2: Pending activation token for pat-2 (Jane Smith) ─────────────
  // Long-lived (1 year) so QA doesn't need to regenerate constantly.
  // OTP: 123456 — document this clearly, change in real pilot.
  console.log('[SEED] Provisioning test activation token for pat-2...');
  const testOtpExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  await run(
    `INSERT INTO patient_activation_tokens (patient_id, otp, expires_at) VALUES ('pat-2', '123456', ?)`,
    [testOtpExpiry]
  );

  // ── Encounters ────────────────────────────────────────────────────────────
  console.log('[SEED] Provisioning encounter data...');
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-1', 'pat-1', 'RECEPTION', 1)`);
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-2', 'pat-2', 'IN_CONSULTATION', 1)`);
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-3', 'pat-3', 'AWAITING', 1)`);

  await run(
    `INSERT INTO clinical_notes (id, encounter_id, draft_content, status, __v)
     VALUES ('note-1', 'enc-2', 'Patient presents with general fatigue. Vitals stable.', 'DRAFT', 1)`
  );
  await run(
    `INSERT INTO prescriptions (id, encounter_id, rx_content, status, __v)
     VALUES ('rx-1', 'enc-2', 'Paracetamol 500mg TDS x 5 days', 'DRAFT', 1)`
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
  console.log('[SEED] Staff accounts (password: Password123!):');
  console.log('  nurse_qa    NURSE');
  console.log('  doc1_qa     DOCTOR');
  console.log('  doc2_qa     DOCTOR');
  console.log('  admin_qa    ADMIN');
  console.log('');
  console.log('[SEED] Patient accounts:');
  console.log('  patient_qa  PATIENT  → linked to pat-1 (John Doe)    — pre-activated, password: Password123!');
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
