const bcrypt = require('bcryptjs');

const SEEDED_PASSWORD = 'Password123!';

const SEEDED_PATIENTS = [
  { id: 'pat-1', name: 'John Doe', dob: '1980-01-01', gender: 'Male' },
  { id: 'pat-2', name: 'Jane Smith', dob: '1990-05-15', gender: 'Female' },
  { id: 'pat-3', name: 'Ramesh Sivakumar', dob: '1975-03-22', gender: 'Male' }
];

const SEEDED_USERS = [
  { id: 'nurse_qa', role: 'NURSE', name: 'Nurse QA', patient_id: null },
  { id: 'doc1_qa', role: 'DOCTOR', name: 'Dr. S. Nair', patient_id: null },
  { id: 'doc2_qa', role: 'DOCTOR', name: 'Dr. V. Raman', patient_id: null },
  { id: 'admin_qa', role: 'ADMIN', name: 'Admin QA', patient_id: null },
  { id: 'patient_qa', role: 'PATIENT', name: 'John Doe', patient_id: 'pat-1' }
];

const SEEDED_ENCOUNTERS = [
  { id: 'enc-1', patient_id: 'pat-1', phase: 'RECEPTION', is_discharged: 0, __v: 1 },
  { id: 'enc-2', patient_id: 'pat-2', phase: 'IN_CONSULTATION', is_discharged: 0, __v: 1 },
  { id: 'enc-3', patient_id: 'pat-3', phase: 'AWAITING', is_discharged: 0, __v: 1 }
];

const SEEDED_NOTES = [
  {
    id: 'note-1',
    encounter_id: 'enc-2',
    draft_content: 'Patient presents with general fatigue. Vitals stable.',
    status: 'DRAFT',
    author_id: 'doc1_qa',
    __v: 1
  }
];

const SEEDED_PRESCRIPTIONS = [
  {
    id: 'rx-1',
    encounter_id: 'enc-2',
    rx_content: 'Paracetamol 500mg TDS x 5 days',
    status: 'DRAFT',
    authorizing_user_id: null,
    __v: 1
  }
];

function buildInsertIgnoreSql(dialect, table, columns, conflictTarget) {
  const columnsSql = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  if (dialect === 'postgres') {
    return `INSERT INTO ${table} (${columnsSql}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO NOTHING`;
  }
  return `INSERT OR IGNORE INTO ${table} (${columnsSql}) VALUES (${placeholders})`;
}

async function upsertByPrimaryKey(context, table, conflictTarget, row, updateColumns) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);

  await context.run(buildInsertIgnoreSql(context.dialect, table, columns, conflictTarget), values);

  if (updateColumns.length === 0) {
    return;
  }

  const assignments = updateColumns.map((column) => `${column} = ?`).join(', ');
  await context.run(
    `UPDATE ${table} SET ${assignments} WHERE ${conflictTarget} = ?`,
    [...updateColumns.map((column) => row[column]), row[conflictTarget]]
  );
}

function normalizeContext(db) {
  if (!db || typeof db.run !== 'function') {
    throw new Error('seedDatabase requires a db object with a run(sql, params) function.');
  }

  return {
    run: db.run,
    dialect: db.dialect || db.dbDialect || process.env.DB_DIALECT || 'sqlite'
  };
}

async function seedDatabase(db) {
  const context = normalizeContext(db);
  const passwordHash = await bcrypt.hash(SEEDED_PASSWORD, 10);

  for (const patient of SEEDED_PATIENTS) {
    await upsertByPrimaryKey(context, 'patients', 'id', patient, []);
  }

  for (const user of SEEDED_USERS) {
    await upsertByPrimaryKey(
      context,
      'users',
      'id',
      {
        id: user.id,
        role: user.role,
        name: user.name,
        password_hash: passwordHash,
        is_active: 1,
        patient_id: user.patient_id,
        failed_attempts: 0,
        locked_until: null
      },
      ['role', 'name', 'password_hash', 'is_active', 'patient_id', 'failed_attempts', 'locked_until']
    );
  }

  for (const encounter of SEEDED_ENCOUNTERS) {
    await upsertByPrimaryKey(
      context,
      'encounters',
      'id',
      encounter,
      []
    );
  }

  for (const note of SEEDED_NOTES) {
    await upsertByPrimaryKey(
      context,
      'clinical_notes',
      'id',
      note,
      []
    );
  }

  for (const prescription of SEEDED_PRESCRIPTIONS) {
    await upsertByPrimaryKey(
      context,
      'prescriptions',
      'id',
      prescription,
      []
    );
  }
}

module.exports = { SEEDED_PASSWORD, seedDatabase };
