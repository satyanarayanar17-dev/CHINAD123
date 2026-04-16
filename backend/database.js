const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { applyMigrations } = require('./migrations');
const { seedDevelopmentDatabase } = require('./seed');
const { runtimeConfig } = require('./config');
const { logEvent } = require('./lib/logger');

const dbDialect = runtimeConfig.dbDialect;
const sqlitePath = path.resolve(__dirname, runtimeConfig.sqlitePath);
const useDatabaseSsl = runtimeConfig.databaseSsl ||
  process.env.PGSSLMODE === 'require' ||
  process.env.PGSSLMODE === 'verify-ca' ||
  process.env.PGSSLMODE === 'verify-full';

let db;
let pgPool;
let sqliteTransactionChain = Promise.resolve();

function createPostgresQueryContext(client) {
  return {
    dialect: dbDialect,
    run: async (sql, params = []) => {
      const res = await client.query(transpileQuery(sql), params);
      return {
        lastID: res.rows?.[0]?.id ?? null,
        changes: res.rowCount,
        rows: res.rows
      };
    },
    get: async (sql, params = []) => {
      const res = await client.query(transpileQuery(sql), params);
      return res.rows[0];
    },
    all: async (sql, params = []) => {
      const res = await client.query(transpileQuery(sql), params);
      return res.rows;
    }
  };
}

if (dbDialect === 'postgres') {
  logEvent('info', 'db_pool_connecting', { dialect: 'postgres' });
  pgPool = new Pool({
    connectionString: runtimeConfig.databaseUrl,
    max: runtimeConfig.pgPoolMax,
    connectionTimeoutMillis: runtimeConfig.pgConnectTimeoutMs,
    ssl: useDatabaseSsl ? { rejectUnauthorized: false } : undefined
  });
  pgPool.on('error', (err) => {
    logEvent('error', 'db_pool_error', { dialect: 'postgres', error: err.message });
  });
} else {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  db = new sqlite3.Database(sqlitePath);
  db.serialize(() => {
    db.run(`PRAGMA foreign_keys = ON`);
  });
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

async function withTransaction(work) {
  if (typeof work !== 'function') {
    throw new Error('withTransaction requires a callback.');
  }

  if (dbDialect === 'postgres') {
    const client = await pgPool.connect();
    const context = createPostgresQueryContext(client);

    try {
      await client.query('BEGIN');
      const result = await work(context);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logEvent('error', 'db_rollback_failed', { dialect: 'postgres', error: rollbackErr.message });
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const executeSqliteTransaction = async () => {
    await run('BEGIN IMMEDIATE');
    try {
      const result = await work({ run, get, all, dialect: dbDialect });
      await run('COMMIT');
      return result;
    } catch (err) {
      try {
        await run('ROLLBACK');
      } catch (rollbackErr) {
        logEvent('error', 'db_rollback_failed', { dialect: 'sqlite', error: rollbackErr.message });
      }
      throw err;
    }
  };

  const queuedTransaction = sqliteTransactionChain.then(
    executeSqliteTransaction,
    executeSqliteTransaction
  );
  sqliteTransactionChain = queuedTransaction.then(
    () => undefined,
    () => undefined
  );

  return queuedTransaction;
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
    'data_integrity_quarantine',
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

  logEvent('warn', 'db_destructive_reset_start', { dialect: dbDialect });

  await dropAllTables();
  await migrateDatabase();

  if (!skipDataSeed) {
    await seedDevelopmentDatabase({ run, dialect: dbDialect, mode: seedMode });
  }

  logEvent('info', 'db_schema_boot_complete', { dialect: dbDialect });
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
  withTransaction,
  dropAllTables,
  resetAndSeedDatabase
};
