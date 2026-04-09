const bcrypt = require('bcryptjs');
const { run, get } = require('../database');

/**
 * APPEND SEED — Idempotent, non-destructive
 *
 * Safe to run against any database state — existing rows are skipped.
 * Use this to populate a fresh schema without destroying existing data,
 * or to add the test patient user for portal development.
 *
 * USAGE:
 *   node scripts/append-seed.js
 *
 * What this seeds (skipped if already present):
 *   - 4 staff users (nurse_qa, doc1_qa, doc2_qa, admin_qa)
 *   - 3 test patients
 *   - 3 encounters
 *   - 1 clinical note, 1 prescription
 *   - 1 pre-linked patient portal user (usr-pat-1 → pat-1) for portal testing
 */

const dialect = process.env.DB_DIALECT || 'sqlite';

// Dialect-appropriate upsert-skip statement
function insertIgnore(table, columns, placeholders) {
  if (dialect === 'postgres') {
    return `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  }
  return `INSERT OR IGNORE INTO ${table} (${columns}) VALUES (${placeholders})`;
}

async function runAppendSeed() {
  console.log('[SEED:APPEND] Starting idempotent append seed...');

  const baseHash = await bcrypt.hash('Password123!', 10);

  // Staff users
  await run(insertIgnore('users', 'id, role, name, password_hash, is_active', '?, ?, ?, ?, ?'), ['nurse_qa', 'NURSE', 'Nurse QA', baseHash, 1]);
  await run(insertIgnore('users', 'id, role, name, password_hash, is_active', '?, ?, ?, ?, ?'), ['doc1_qa', 'DOCTOR', 'Doctor One', baseHash, 1]);
  await run(insertIgnore('users', 'id, role, name, password_hash, is_active', '?, ?, ?, ?, ?'), ['doc2_qa', 'DOCTOR', 'Doctor Two', baseHash, 1]);
  await run(insertIgnore('users', 'id, role, name, password_hash, is_active', '?, ?, ?, ?, ?'), ['admin_qa', 'ADMIN', 'Admin QA', baseHash, 1]);

  // Test patients
  await run(insertIgnore('patients', 'id, name, dob, gender', '?, ?, ?, ?'), ['pat-1', 'John Doe', '1980-01-01', 'Male']);
  await run(insertIgnore('patients', 'id, name, dob, gender', '?, ?, ?, ?'), ['pat-2', 'Jane Smith', '1990-05-15', 'Female']);
  await run(insertIgnore('patients', 'id, name, dob, gender', '?, ?, ?, ?'), ['pat-3', 'Ramesh Sivakumar', '1975-03-22', 'Male']);

  // Encounters
  await run(insertIgnore('encounters', 'id, patient_id, phase, __v', '?, ?, ?, ?'), ['enc-1', 'pat-1', 'RECEPTION', 1]);
  await run(insertIgnore('encounters', 'id, patient_id, phase, __v', '?, ?, ?, ?'), ['enc-2', 'pat-2', 'IN_CONSULTATION', 1]);
  await run(insertIgnore('encounters', 'id, patient_id, phase, __v', '?, ?, ?, ?'), ['enc-3', 'pat-3', 'AWAITING', 1]);

  // Clinical data
  await run(insertIgnore('clinical_notes', 'id, encounter_id, draft_content, status, __v', '?, ?, ?, ?, ?'), ['note-1', 'enc-2', 'Patient presents with general fatigue. Vitals stable.', 'DRAFT', 1]);
  await run(insertIgnore('prescriptions', 'id, encounter_id, rx_content, status, __v', '?, ?, ?, ?, ?'), ['rx-1', 'enc-2', 'Paracetamol 500mg TDS x 5 days', 'DRAFT', 1]);

  // Pre-linked patient portal user — skips OTP activation flow for development
  await run(
    insertIgnore('users', 'id, role, name, password_hash, is_active, patient_id', '?, ?, ?, ?, ?, ?'),
    ['usr-pat-1', 'PATIENT', 'John Doe', baseHash, 1, 'pat-1']
  );

  console.log('');
  console.log('[SEED:APPEND] Done. Credentials (password: Password123!):');
  console.log('  Staff  — nurse_qa, doc1_qa, doc2_qa, admin_qa');
  console.log('  Patient — usr-pat-1  (linked to pat-1: John Doe)');
  console.log('');
  process.exit(0);
}

runAppendSeed().catch(err => {
  console.error('[SEED:APPEND] Failed:', err);
  process.exit(1);
});
