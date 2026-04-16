const bcrypt = require('bcryptjs');

// Shared password for the seeded admin account (local development only).
// This account is disabled in production / restricted_web_pilot environments.
const SEEDED_PASSWORD = 'Password123!';

// Only the admin account is seeded. All other staff and patient accounts
// must be created through the application by the admin after first login.
const SEEDED_USERS = [
  { id: 'admin_qa', role: 'ADMIN', name: 'Admin QA', patient_id: null }
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
    throw new Error('seedDevelopmentDatabase requires a db object with a run(sql, params) function.');
  }

  return {
    run: db.run,
    dialect: db.dialect || db.dbDialect || process.env.DB_DIALECT || 'sqlite'
  };
}

async function seedUsers(context, passwordHash) {
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
}

async function seedDevelopmentDatabase(db, options = {}) {
  const context = normalizeContext(db);
  const passwordHash = await bcrypt.hash(SEEDED_PASSWORD, 10);

  await seedUsers(context, passwordHash);

  return {
    mode: options.mode || 'local-dev',
    seededPassword: SEEDED_PASSWORD
  };
}

module.exports = {
  SEEDED_PASSWORD,
  seedDevelopmentDatabase,
  seedDatabase: seedDevelopmentDatabase
};
