// Additive v2 migration: reuse the existing patients, users, encounters, notes and prescriptions.
module.exports = {
  id: '012_connected_opd',
  async up(db) {
    const columns = {
      patients: { mrn: 'TEXT', email: 'TEXT', address: 'TEXT', city: 'TEXT', state: 'TEXT', pin_code: 'TEXT', emergency_contact: 'TEXT', preferred_language: "TEXT DEFAULT 'en'", existing_mrn: 'TEXT', allergies: "TEXT DEFAULT ''", __v: 'INTEGER NOT NULL DEFAULT 1' },
      encounters: { completed_at: 'TEXT' },
      refresh_tokens: { device_name: 'TEXT', created_at: 'TEXT' },
    };
    for (const [table, definitions] of Object.entries(columns)) {
      const existing = db.dialect === 'postgres'
        ? await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?', ['public', table])
        : await db.all(`PRAGMA table_info(${table})`);
      for (const [name, type] of Object.entries(definitions)) {
        if (!existing.some(c => c.name === name)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
    await db.run('UPDATE patients SET mrn = id WHERE mrn IS NULL');
    const statements = [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_mrn ON patients(mrn)',
      `CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL UNIQUE)`,
      `CREATE TABLE IF NOT EXISTS practitioner_schedules (
        id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id), department_id TEXT NOT NULL REFERENCES departments(id),
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        slot_minutes INTEGER NOT NULL CHECK (slot_minutes BETWEEN 5 AND 120), room TEXT NOT NULL,
        break_start TEXT, break_end TEXT, __v INTEGER NOT NULL DEFAULT 1, UNIQUE(doctor_id, weekday)
      )`,
      `CREATE TABLE IF NOT EXISTS practitioner_unavailability (id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, reason TEXT NOT NULL, UNIQUE(doctor_id, date))`,
      `CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES users(id),
        department_id TEXT NOT NULL REFERENCES departments(id), scheduled_at TEXT NOT NULL, ends_at TEXT NOT NULL, room TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW')),
        reason TEXT NOT NULL, encounter_id TEXT UNIQUE REFERENCES encounters(id), follow_up_of TEXT REFERENCES encounters(id),
        created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, __v INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_slot ON appointments(doctor_id, scheduled_at) WHERE status NOT IN ('CANCELLED', 'NO_SHOW')`,
      `CREATE INDEX IF NOT EXISTS idx_appointment_patient ON appointments(patient_id, scheduled_at)`,
      `CREATE TABLE IF NOT EXISTS token_counters (department_id TEXT NOT NULL REFERENCES departments(id), date TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY(department_id, date))`,
      `CREATE TABLE IF NOT EXISTS queue_entries (
        encounter_id TEXT PRIMARY KEY REFERENCES encounters(id), appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id),
        department_id TEXT NOT NULL REFERENCES departments(id), token TEXT NOT NULL, date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('WAITING','TRIAGE','WAITING_DOCTOR','DOCTOR_READY','CONSULTATION','COMPLETED')),
        priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0,1,2)), checked_in_at TEXT NOT NULL, checked_in_by TEXT NOT NULL REFERENCES users(id),
        identity_verified INTEGER NOT NULL CHECK (identity_verified = 1), triage_started_at TEXT, consultation_started_at TEXT,
        __v INTEGER NOT NULL DEFAULT 1, UNIQUE(department_id, date, token)
      )`,
      `CREATE TABLE IF NOT EXISTS triage_records (
        id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), version INTEGER NOT NULL,
        data TEXT NOT NULL, nurse_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, amendment_reason TEXT,
        UNIQUE(encounter_id, version)
      )`,
      `CREATE TABLE IF NOT EXISTS clinical_versions (
        id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, encounter_id TEXT NOT NULL REFERENCES encounters(id),
        version INTEGER NOT NULL, data TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(resource_type, resource_id, version)
      )`,
      `CREATE TABLE IF NOT EXISTS drug_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, strength TEXT NOT NULL, form TEXT NOT NULL, route TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS diagnosis_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)`,
      `CREATE TABLE IF NOT EXISTS lab_test_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, department TEXT NOT NULL, unit TEXT NOT NULL, reference_range TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS lab_orders (
        id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), test_id TEXT NOT NULL REFERENCES lab_test_catalog(id),
        ordered_by TEXT NOT NULL REFERENCES users(id), ordered_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ORDERED','COLLECTED','PROCESSING','AVAILABLE','REVIEWED')), __v INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS lab_results (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES lab_orders(id), version INTEGER NOT NULL,
        value TEXT NOT NULL, unit TEXT NOT NULL, reference_range TEXT NOT NULL, flag TEXT NOT NULL CHECK (flag IN ('NORMAL','HIGH','LOW','CRITICAL')),
        entered_by TEXT NOT NULL REFERENCES users(id), verified_by TEXT NOT NULL REFERENCES users(id), resulted_at TEXT NOT NULL,
        released INTEGER NOT NULL CHECK (released IN (0,1)), reason TEXT NOT NULL, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
        UNIQUE(order_id, version)
      )`,
      `CREATE TABLE IF NOT EXISTS journey_events (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT REFERENCES encounters(id),
        appointment_id TEXT REFERENCES appointments(id), code TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), occurred_at TEXT NOT NULL, context TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_journey_patient ON journey_events(patient_id, occurred_at)',
      `CREATE TABLE IF NOT EXISTS patient_otps (phone TEXT PRIMARY KEY, hash TEXT NOT NULL, expires_at TEXT NOT NULL, sent_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS opd_notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), patient_id TEXT REFERENCES patients(id),
        code TEXT NOT NULL, context TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, dedupe_key TEXT UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS sms_outbox (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), code TEXT NOT NULL, context TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, created_at TEXT NOT NULL, dedupe_key TEXT UNIQUE
      )`,
    ];
    for (const sql of statements) await db.run(sql);
  },
};
