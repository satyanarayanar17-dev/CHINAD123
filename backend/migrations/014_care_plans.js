const { logEvent } = require('../lib/logger');

module.exports = {
  up: async (db) => {
    logEvent('info', 'migration_start', { version: '014_care_plans' });
    const statements = [
      `CREATE TABLE IF NOT EXISTS care_plans (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        doctor_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CANCELLED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS care_plan_tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES care_plans(id),
        task_type TEXT NOT NULL CHECK (task_type IN ('READING','ACTIVITY','MEDICATION','INSULIN')),
        title TEXT NOT NULL,
        description TEXT,
        target_metric TEXT,
        frequency_rule TEXT,
        scheduled_time TEXT,
        start_date TEXT,
        end_date TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        prescription_item_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS care_plan_adherence (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES care_plan_tasks(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        due_date TEXT NOT NULL,
        due_time TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RECORDED','COMPLETED','MISSED','SKIPPED')),
        recorded_value TEXT,
        recorded_at TEXT,
        patient_note TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS patient_observations (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        metric TEXT NOT NULL,
        value TEXT NOT NULL,
        unit TEXT,
        recorded_at TEXT NOT NULL,
        source TEXT NOT NULL,
        adherence_id TEXT REFERENCES care_plan_adherence(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_adherence_patient_date ON care_plan_adherence(patient_id, due_date)`
    ];
    for (const sql of statements) await db.run(sql);
  },
};
