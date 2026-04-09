const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

const dbDialect = process.env.DB_DIALECT || 'sqlite';
let db;
let pgPool;

if (dbDialect === 'postgres') {
  console.log('[DB] Connecting to PostgreSQL pool...');
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
  const dbPath = path.resolve(__dirname, 'verification.db');
  db = new sqlite3.Database(dbPath);
}

function transpileQuery(sql) {
  if (dbDialect === 'sqlite') return sql;
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const run = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve({ lastID: null, changes: res.rowCount });
    } catch (e) { reject(e); }
  } else {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  }
});

const get = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve(res.rows[0]);
    } catch (e) { reject(e); }
  } else {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }
});

const all = (sql, params = []) => new Promise(async (resolve, reject) => {
  if (dbDialect === 'postgres') {
    try {
      const res = await pgPool.query(transpileQuery(sql), params);
      resolve(res.rows);
    } catch (e) { reject(e); }
  } else {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }
});

async function resetAndSeedDatabase() {
  console.log(`[DB] Initiating schema reset (${dbDialect})...`);

  if (dbDialect === 'postgres') {
    // Drop in dependency-safe order.
    // revoked_tokens = Phase 3. drafts/refresh_tokens = old names (safe to drop if they exist).
    await run(`DROP TABLE IF EXISTS revoked_tokens CASCADE`);
    await run(`DROP TABLE IF EXISTS drafts CASCADE`);
    await run(`DROP TABLE IF EXISTS refresh_tokens CASCADE`);
    await run(`DROP TABLE IF EXISTS audit_logs CASCADE`);
    await run(`DROP TABLE IF EXISTS clinical_drafts CASCADE`);
    await run(`DROP TABLE IF EXISTS notifications CASCADE`);
    await run(`DROP TABLE IF EXISTS prescriptions CASCADE`);
    await run(`DROP TABLE IF EXISTS clinical_notes CASCADE`);
    await run(`DROP TABLE IF EXISTS encounters CASCADE`);
    await run(`DROP TABLE IF EXISTS patient_activation_tokens CASCADE`);
    await run(`DROP TABLE IF EXISTS users CASCADE`);
    await run(`DROP TABLE IF EXISTS patients CASCADE`);

    await run(`CREATE TABLE patients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      dob TEXT NOT NULL, gender TEXT DEFAULT 'Not specified')`);

    await run(`CREATE TABLE users (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL,
      password_hash TEXT, is_active INTEGER DEFAULT 1,
      patient_id TEXT REFERENCES patients(id),
      failed_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP)`);

    await run(`CREATE TABLE patient_activation_tokens (
      patient_id TEXT PRIMARY KEY REFERENCES patients(id),
      otp TEXT NOT NULL, expires_at TIMESTAMP NOT NULL)`);

    await run(`CREATE TABLE encounters (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
      phase TEXT NOT NULL, is_discharged INTEGER DEFAULT 0, __v INTEGER DEFAULT 1)`);

    await run(`CREATE TABLE clinical_notes (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
      draft_content TEXT, status TEXT DEFAULT 'DRAFT', author_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, __v INTEGER DEFAULT 1)`);

    await run(`CREATE TABLE prescriptions (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
      rx_content TEXT, status TEXT DEFAULT 'DRAFT', authorizing_user_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, __v INTEGER DEFAULT 1)`);

    await run(`CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      correlation_id TEXT, actor_id TEXT, patient_id TEXT,
      action TEXT NOT NULL, prior_state TEXT, new_state TEXT)`);

    // Phase 2: Persistent draft store — key/data column names match drafts.js
    await run(`CREATE TABLE clinical_drafts (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      etag TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Phase 2: Persistent notifications — auto-increment id, role-filtered
    await run(`CREATE TABLE notifications (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      patient_id TEXT,
      actor_id TEXT,
      target_role TEXT,
      read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    // Phase 3: Token revocation — per-user revocation timestamp
    await run(`CREATE TABLE revoked_tokens (
      user_id TEXT PRIMARY KEY,
      revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

    await run(`CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_encounters_is_discharged ON encounters(is_discharged)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_clinical_notes_status ON clinical_notes(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON prescriptions(encounter_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id ON audit_logs(patient_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_users_patient_id ON users(patient_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`);

  } else {
    // SQLite schema
    await run(`DROP TABLE IF EXISTS revoked_tokens`);
    await run(`DROP TABLE IF EXISTS drafts`);
    await run(`DROP TABLE IF EXISTS refresh_tokens`);
    await run(`DROP TABLE IF EXISTS audit_logs`);
    await run(`DROP TABLE IF EXISTS clinical_drafts`);
    await run(`DROP TABLE IF EXISTS notifications`);
    await run(`DROP TABLE IF EXISTS prescriptions`);
    await run(`DROP TABLE IF EXISTS clinical_notes`);
    await run(`DROP TABLE IF EXISTS encounters`);
    await run(`DROP TABLE IF EXISTS patient_activation_tokens`);
    await run(`DROP TABLE IF EXISTS users`);
    await run(`DROP TABLE IF EXISTS patients`);

    await run(`CREATE TABLE patients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      dob TEXT NOT NULL, gender TEXT DEFAULT 'Not specified')`);

    await run(`CREATE TABLE users (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL,
      password_hash TEXT, is_active INTEGER DEFAULT 1,
      failed_attempts INTEGER DEFAULT 0, locked_until DATETIME,
      patient_id TEXT, FOREIGN KEY(patient_id) REFERENCES patients(id))`);

    await run(`CREATE TABLE patient_activation_tokens (
      patient_id TEXT PRIMARY KEY, otp TEXT NOT NULL, expires_at DATETIME NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id))`);

    await run(`CREATE TABLE encounters (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, phase TEXT NOT NULL,
      is_discharged INTEGER DEFAULT 0, __v INTEGER DEFAULT 1,
      FOREIGN KEY(patient_id) REFERENCES patients(id))`);

    await run(`CREATE TABLE clinical_notes (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL,
      draft_content TEXT, status TEXT DEFAULT 'DRAFT', author_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, __v INTEGER DEFAULT 1,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id))`);

    await run(`CREATE TABLE prescriptions (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL,
      rx_content TEXT, status TEXT DEFAULT 'DRAFT', authorizing_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, __v INTEGER DEFAULT 1,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id))`);

    await run(`CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      correlation_id TEXT, actor_id TEXT, patient_id TEXT,
      action TEXT NOT NULL, prior_state TEXT, new_state TEXT)`);

    // Phase 2: Persistent draft store — key/data column names match drafts.js
    await run(`CREATE TABLE clinical_drafts (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      etag TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // Phase 2: Persistent notifications — auto-increment id, role-filtered
    await run(`CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      patient_id TEXT,
      actor_id TEXT,
      target_role TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // Phase 3: Token revocation — per-user revocation timestamp
    await run(`CREATE TABLE revoked_tokens (
      user_id TEXT PRIMARY KEY,
      revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // SQLite dev seed data (matches deploy-seed.js patient IDs)
    await run(`INSERT INTO patients VALUES ('pat-1','John Doe','1980-01-01','Male')`);
    await run(`INSERT INTO patients VALUES ('pat-2','Jane Smith','1990-05-15','Female')`);
    await run(`INSERT INTO patients VALUES ('pat-3','Ramesh Sivakumar','1975-03-22','Male')`);

    await run(`INSERT INTO users (id,role,name) VALUES ('nurse_qa','NURSE','Nurse QA')`);
    await run(`INSERT INTO users (id,role,name) VALUES ('doc1_qa','DOCTOR','Dr. S. Nair')`);
    await run(`INSERT INTO users (id,role,name) VALUES ('doc2_qa','DOCTOR','Dr. V. Raman')`);
    await run(`INSERT INTO users (id,role,name) VALUES ('admin_qa','ADMIN','Admin QA')`);

    await run(`INSERT INTO encounters VALUES ('enc-1','pat-1','RECEPTION',0,1)`);
    await run(`INSERT INTO encounters VALUES ('enc-2','pat-2','IN_CONSULTATION',0,1)`);
    await run(`INSERT INTO encounters VALUES ('enc-3','pat-3','AWAITING',0,1)`);

    await run(`INSERT INTO clinical_notes VALUES ('note-1','enc-2','Patient presents with general fatigue. Vitals stable.','DRAFT','doc1_qa',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`);
    await run(`INSERT INTO prescriptions VALUES ('rx-1','enc-2','Paracetamol 500mg TDS x 5 days','DRAFT',NULL,CURRENT_TIMESTAMP,1)`);
  }

  console.log('[DB] Schema boot complete.');
}

module.exports = { db, pgPool, run, get, all, resetAndSeedDatabase };