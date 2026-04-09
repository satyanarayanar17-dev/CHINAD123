const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { applyMigrations } = require('./migrations');
const { seedDevelopmentDatabase } = require('./seed');

const dbDialect = (process.env.DB_DIALECT || 'sqlite').trim().toLowerCase();
const sqlitePath = path.resolve(__dirname, process.env.SQLITE_PATH || 'verification.db');
const useDatabaseSsl =
  process.env.DATABASE_SSL === 'true' ||
  process.env.PGSSLMODE === 'require' ||
  process.env.PGSSLMODE === 'verify-ca' ||
  process.env.PGSSLMODE === 'verify-full';

let db;
let pgPool;

if (dbDialect === 'postgres') {
  console.log('[DB] Connecting to PostgreSQL pool...');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX || 10),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    ssl: useDatabaseSsl ? { rejectUnauthorized: false } : undefined
  });
  pgPool.on('error', (err) => {
    console.error('[DB] PostgreSQL pool error:', err.message);
  });
} else {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  db = new sqlite3.Database(sqlitePath);
}

function transpileQuery(sql) {
  if (dbDialect === 'sqlite') {
    return sql;
  }

  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const run = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve({
        lastID: res.rows?.[0]?.id ?? null,
        changes: res.rowCount,
        rows: res.rows
      });
    } catch (err) {
      reject(err);
    }
    return;
  }

  db.run(sql, params, function onRun(err) {
    if (err) {
      reject(err);
      return;
    }

    resolve({
      lastID: this.lastID ?? null,
      changes: this.changes ?? 0
    });
  });
});

const get = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve(res.rows[0]);
    } catch (err) {
      reject(err);
    }
    return;
  }

  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
      return;
    }

    resolve(row);
  });
});

const all = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve(res.rows);
    } catch (err) {
      reject(err);
    }
    return;
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
      return;
    }

    resolve(rows);
  });
});

async function pingDatabase() {
  await get(`SELECT 1 AS ok`);
}

async function migrateDatabase() {
  await applyMigrations({ run, all, dialect: dbDialect });
}

async function dropAllTables() {
  const tables = [
    'refresh_tokens',
    'revoked_tokens',
    'audit_logs',
    'notifications',
    'clinical_drafts',
    'prescriptions',
    'clinical_notes',
    'encounters',
    'patient_activation_tokens',
    'users',
    'patients',
    'schema_migrations'
  ];

  for (const table of tables) {
    if (dbDialect === 'postgres') {
      await run(`DROP TABLE IF EXISTS ${table} CASCADE`);
    } else {
      await run(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}

async function resetAndSeedDatabase(options = {}) {
  const {
    skipDataSeed = false,
    seedMode = 'local-demo'
  } = options;

  console.log(`[DB] Initiating destructive reset (${dbDialect})...`);

  await dropAllTables();
  await migrateDatabase();

  if (!skipDataSeed) {
    await seedDevelopmentDatabase({ run, dialect: dbDialect, mode: seedMode });
  }

  console.log('[DB] Schema boot complete.');
}

module.exports = {
  db,
  pgPool,
  dbDialect,
  sqlitePath,
  run,
  get,
  all,
  pingDatabase,
  migrateDatabase,
  dropAllTables,
  resetAndSeedDatabase
};
