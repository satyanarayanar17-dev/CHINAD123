const initialSchema = require('./001_initial_schema');
const dataIntegrityGuards = require('./002_data_integrity_guards');
const refreshTokenAccountType = require('./003_refresh_token_account_type');
const encounterLifecycleContract = require('./004_encounter_lifecycle_contract');
const patientPhoneIdentity = require('./005_patient_phone_identity');
const usersMustChangePassword = require('./006_users_must_change_password');
const triageDoctorAssignment = require('./007_triage_doctor_assignment');
const prescriptionHandover = require('./008_prescription_handover');
const staffUserProfiles = require('./009_staff_user_profiles');

const migrations = [
  initialSchema,
  dataIntegrityGuards,
  refreshTokenAccountType,
  encounterLifecycleContract,
  patientPhoneIdentity,
  usersMustChangePassword,
  triageDoctorAssignment,
  prescriptionHandover,
  staffUserProfiles
];

function migrationTableSql(dialect) {
  if (dialect === 'postgres') {
    return `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
  }

  return `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
}

async function ensureMigrationTable(context) {
  await context.run(migrationTableSql(context.dialect));
}

async function applyMigrations(context) {
  await ensureMigrationTable(context);

  const appliedRows = await context.all(`SELECT id FROM schema_migrations ORDER BY id ASC`);
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    await migration.up(context);
    await context.run(`INSERT INTO schema_migrations (id) VALUES (?)`, [migration.id]);
    console.log(`[DB] Applied migration ${migration.id}`);
  }
}

module.exports = {
  applyMigrations,
  migrations
};
