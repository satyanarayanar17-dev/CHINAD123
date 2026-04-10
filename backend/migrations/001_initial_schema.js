function sqliteStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'Not specified'
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      patient_id TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS patient_activation_tokens (
      patient_id TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      is_discharged INTEGER NOT NULL DEFAULT 0,
      __v INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS clinical_notes (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      draft_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      author_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      rx_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      authorizing_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS clinical_drafts (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      etag TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      patient_id TEXT,
      actor_id TEXT,
      target_role TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      correlation_id TEXT,
      actor_id TEXT,
      patient_id TEXT,
      action TEXT NOT NULL,
      prior_state TEXT,
      new_state TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      user_id TEXT PRIMARY KEY,
      revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id)`,
    `CREATE INDEX IF NOT EXISTS idx_encounters_is_discharged ON encounters(is_discharged)`,
    `CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clinical_notes_status ON clinical_notes(status)`,
    `CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON prescriptions(encounter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id ON audit_logs(patient_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_patient_id_unique ON users(patient_id) WHERE patient_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_phone_unique ON patients(phone) WHERE phone IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`
  ];
}

function postgresStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'Not specified'
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      patient_id TEXT REFERENCES patients(id),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS patient_activation_tokens (
      patient_id TEXT PRIMARY KEY REFERENCES patients(id),
      otp TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      phase TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      is_discharged INTEGER NOT NULL DEFAULT 0,
      __v INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS clinical_notes (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      draft_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      author_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      rx_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      authorizing_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS clinical_drafts (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      etag TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      patient_id TEXT,
      actor_id TEXT,
      target_role TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      correlation_id TEXT,
      actor_id TEXT,
      patient_id TEXT,
      action TEXT NOT NULL,
      prior_state TEXT,
      new_state TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      user_id TEXT PRIMARY KEY,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id)`,
    `CREATE INDEX IF NOT EXISTS idx_encounters_is_discharged ON encounters(is_discharged)`,
    `CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clinical_notes_status ON clinical_notes(status)`,
    `CREATE INDEX IF NOT EXISTS idx_prescriptions_encounter_id ON prescriptions(encounter_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id ON audit_logs(patient_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_patient_id_unique ON users(patient_id) WHERE patient_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_phone_unique ON patients(phone) WHERE phone IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`
  ];
}

async function hasColumn(context, tableName, columnName) {
  if (context.dialect === 'postgres') {
    const rows = await context.all(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
      [tableName, columnName]
    );
    return rows.length > 0;
  }

  const rows = await context.all(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function ensureEncounterCreatedAt(context) {
  const columnExists = await hasColumn(context, 'encounters', 'created_at');
  if (columnExists) {
    return;
  }

  if (context.dialect === 'postgres') {
    await context.run(
      `ALTER TABLE encounters
       ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
    return;
  }

  await context.run(`ALTER TABLE encounters ADD COLUMN created_at TEXT`);
  await context.run(`UPDATE encounters SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
}

async function ensureEncounterLifecycleStatus(context) {
  const columnExists = await hasColumn(context, 'encounters', 'lifecycle_status');
  if (columnExists) {
    return;
  }

  await context.run(`ALTER TABLE encounters ADD COLUMN lifecycle_status TEXT`);
  await context.run(
    `UPDATE encounters
     SET lifecycle_status = CASE
       WHEN is_discharged = 1 OR UPPER(TRIM(phase)) IN ('DISCHARGED', 'CLOSED') THEN 'DISCHARGED'
       WHEN UPPER(TRIM(phase)) IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION') THEN UPPER(TRIM(phase))
       ELSE lifecycle_status
     END
     WHERE lifecycle_status IS NULL OR TRIM(lifecycle_status) = ''`
  );
}

module.exports = {
  id: '001_initial_schema',
  async up(context) {
    const statements = context.dialect === 'postgres' ? postgresStatements() : sqliteStatements();
    for (const statement of statements) {
      await context.run(statement);
    }

    await ensureEncounterCreatedAt(context);
    await ensureEncounterLifecycleStatus(context);
    await context.run(`CREATE INDEX IF NOT EXISTS idx_encounters_created_at ON encounters(created_at)`);
    await context.run(`CREATE INDEX IF NOT EXISTS idx_encounters_lifecycle_status ON encounters(lifecycle_status)`);
  }
};
