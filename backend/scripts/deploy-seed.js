const bcrypt = require('bcryptjs');
const { run, resetAndSeedDatabase } = require('../database');

/**
 * DEPLOY SEED — Restricted Web Pilot
 *
 * WARNING: This script is DESTRUCTIVE. It drops and recreates all tables.
 * ALL existing data will be lost if re-run on a live database.
 *
 * USAGE (safe mode requires explicit confirmation flag):
 *   node scripts/deploy-seed.js --confirm-destroy
 *
 * DO NOT run on a database containing real patient data.
 * Run pg_dump backup BEFORE executing this on any non-empty database.
 *
 * This script is intended to be run ONCE before the first pilot start,
 * or to reset a test/staging environment completely.
 */

const args = process.argv.slice(2);

if (!args.includes('--confirm-destroy')) {
  console.error('');
  console.error('[ SAFETY BLOCK ] This script will DROP ALL TABLES and recreate the schema.');
  console.error('[ SAFETY BLOCK ] All existing data will be permanently deleted.');
  console.error('');
  console.error('To proceed, you must explicitly acknowledge this by running:');
  console.error('   node scripts/deploy-seed.js --confirm-destroy');
  console.error('');
  console.error('RECOMMENDATION: Run pg_dump backup before re-seeding a live database.');
  process.exit(1);
}

async function runDeploySeed() {
  console.log('[SEED] Building Core Schema (DESTRUCTIVE — you confirmed --confirm-destroy)...');
  
  await resetAndSeedDatabase();
  
  console.log('[SEED] Hashing base passwords...');
  // Cost 10: adequate for restricted pilot without crippling container boot.
  const baseHash = await bcrypt.hash('Password123!', 10);
  
  console.log('[SEED] Clearing any auto-seeded non-password records...');
  await run(`DELETE FROM users`);
  await run(`DELETE FROM patients`);
  await run(`DELETE FROM encounters`);
  await run(`DELETE FROM clinical_notes`);
  await run(`DELETE FROM prescriptions`);

  console.log('[SEED] Populating Staff Directory with hashed credentials...');
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('nurse_qa', 'NURSE', 'Nurse QA', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('doc1_qa', 'DOCTOR', 'Doctor One', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('doc2_qa', 'DOCTOR', 'Doctor Two', ?, 1)`, [baseHash]);
  await run(`INSERT INTO users (id, role, name, password_hash, is_active) VALUES ('admin_qa', 'ADMIN', 'Admin QA', ?, 1)`, [baseHash]);

  console.log('[SEED] Populating pilot test patient data (NO REAL PHI)...');
  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-1', 'John Doe', '1980-01-01', 'Male')`);
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-1', 'pat-1', 'RECEPTION', 1)`);
  
  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-2', 'Jane Smith', '1990-05-15', 'Female')`);
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-2', 'pat-2', 'IN_CONSULTATION', 1)`);

  await run(`INSERT INTO patients (id, name, dob, gender) VALUES ('pat-3', 'Ramesh Sivakumar', '1975-03-22', 'Male')`);
  await run(`INSERT INTO encounters (id, patient_id, phase, __v) VALUES ('enc-3', 'pat-3', 'AWAITING', 1)`);

  await run(`INSERT INTO clinical_notes (id, encounter_id, draft_content, status, __v) VALUES ('note-1', 'enc-2', 'Patient presents with general fatigue. Vitals stable.', 'DRAFT', 1)`);
  await run(`INSERT INTO prescriptions (id, encounter_id, rx_content, status, __v) VALUES ('rx-1', 'enc-2', 'Paracetamol 500mg TDS x 5 days', 'DRAFT', 1)`);

  console.log('');
  console.log('[SEED] Success: Pilot accounts and test data provisioned.');
  console.log('[SEED] Staff credentials (all use password: Password123!):');
  console.log('  - nurse_qa  (NURSE)');
  console.log('  - doc1_qa   (DOCTOR)');
  console.log('  - doc2_qa   (DOCTOR)');
  console.log('  - admin_qa  (ADMIN)');
  console.log('');
  console.log('[SEED] REMINDER: Change default passwords immediately after pilot provisioning.');
  process.exit(0);
}

runDeploySeed().catch(err => {
  console.error('[SEED] Failed trying to execute deployment seed:', err);
  process.exit(1);
});
