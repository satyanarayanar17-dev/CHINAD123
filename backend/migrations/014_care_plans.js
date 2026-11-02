const { randomUUID, createHash } = require('node:crypto');
const { logEvent } = require('../lib/logger');

async function tableExists(db, table) {
  if (db.dialect === 'postgres') {
    return Boolean((await db.all(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name=?',
      ['public', table]
    ))[0]);
  }
  return Boolean((await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]))[0]);
}

async function columns(db, table) {
  if (!(await tableExists(db, table))) return [];
  return db.dialect === 'postgres'
    ? db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=? AND table_name=?', ['public', table])
    : db.all(`PRAGMA table_info(${table})`);
}

module.exports = {
  id: '014_care_plans',
  async up(db) {
    logEvent('info', 'migration_start', { version: '014_care_plans' });

    // The unreleased prototype could create tables before failing to record its
    // missing migration id. Rebuild only an empty prototype and fail closed on data.
    const planColumns = await columns(db, 'care_plans');
    if (planColumns.length && !planColumns.some(column => column.name === 'department_id')) {
      let rows = 0;
      for (const table of ['care_plans', 'care_plan_tasks', 'care_plan_adherence', 'patient_observations']) {
        if (await tableExists(db, table)) rows += Number((await db.all(`SELECT COUNT(*) AS count FROM ${table}`))[0]?.count || 0);
      }
      if (rows) throw new Error('UNRELEASED_CARE_PLAN_PROTOTYPE_HAS_DATA');
      for (const table of ['patient_observations', 'care_plan_adherence', 'care_plan_tasks', 'care_plans']) {
        if (await tableExists(db, table)) await db.run(`DROP TABLE ${table}`);
      }
    }

    const ogByName = (await db.all('SELECT id,name,prefix FROM departments WHERE name=?', ['Obstetrics & Gynaecology']))[0];
    const ogByPrefix = (await db.all('SELECT id,name,prefix FROM departments WHERE prefix=?', ['OBST']))[0];
    if ((ogByName && ogByName.prefix !== 'OBST') || (ogByPrefix && ogByPrefix.name !== 'Obstetrics & Gynaecology')) {
      throw new Error('OG_DEPARTMENT_IDENTITY_CONFLICT');
    }
    if (!ogByName && !ogByPrefix) {
      await db.run('INSERT INTO departments (id,name,prefix) VALUES (?,?,?)', [
        `dept-${randomUUID()}`, 'Obstetrics & Gynaecology', 'OBST'
      ]);
    }

    const statements = [
      `CREATE TABLE IF NOT EXISTS prescription_items (
        id TEXT PRIMARY KEY, prescription_id TEXT NOT NULL REFERENCES prescriptions(id),
        prescription_version INTEGER NOT NULL CHECK (prescription_version > 0),
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0), drug_id TEXT NOT NULL REFERENCES drug_catalog(id),
        dose TEXT NOT NULL, frequency TEXT NOT NULL, duration TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
        UNIQUE(prescription_id,prescription_version,ordinal)
      )`,
      `CREATE TABLE IF NOT EXISTS care_plans (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
        department_id TEXT NOT NULL REFERENCES departments(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (timezone = 'Asia/Kolkata'),
        start_date TEXT NOT NULL, end_date TEXT, created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        __v INTEGER NOT NULL DEFAULT 1 CHECK (__v > 0), CHECK (end_date IS NULL OR end_date >= start_date)
      )`,
      `CREATE TABLE IF NOT EXISTS care_plan_tasks (
        id TEXT PRIMARY KEY, series_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        plan_id TEXT NOT NULL REFERENCES care_plans(id), supersedes_task_id TEXT REFERENCES care_plan_tasks(id),
        task_type TEXT NOT NULL CHECK (task_type IN ('MEASUREMENT','ACTIVITY','MEDICATION','INSULIN')),
        title TEXT NOT NULL, instruction TEXT NOT NULL, observation_type TEXT, timing_relation TEXT, target_unit TEXT,
        prescription_item_id TEXT REFERENCES prescription_items(id),
        frequency_type TEXT NOT NULL CHECK (frequency_type IN ('DAILY','SELECTED_DAYS','EVERY_N_DAYS','ONCE')),
        scheduled_time TEXT NOT NULL, weekdays_mask INTEGER, interval_days INTEGER, one_time_date TEXT,
        start_date TEXT NOT NULL, end_date TEXT, expected_duration_minutes INTEGER,
        window_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (window_before_minutes >= 0),
        window_after_minutes INTEGER NOT NULL DEFAULT 120 CHECK (window_after_minutes >= 0),
        reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminder_enabled IN (0,1)),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUPERSEDED')),
        created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(series_id,revision), CHECK (end_date IS NULL OR end_date >= start_date),
        CHECK ((task_type='MEASUREMENT' AND observation_type IS NOT NULL AND timing_relation IS NOT NULL AND target_unit IS NOT NULL AND prescription_item_id IS NULL) OR (task_type IN ('MEDICATION','INSULIN') AND prescription_item_id IS NOT NULL AND observation_type IS NULL) OR (task_type='ACTIVITY' AND prescription_item_id IS NULL AND observation_type IS NULL)),
        CHECK ((frequency_type='DAILY' AND weekdays_mask IS NULL AND interval_days IS NULL AND one_time_date IS NULL) OR (frequency_type='SELECTED_DAYS' AND weekdays_mask BETWEEN 1 AND 127 AND interval_days IS NULL AND one_time_date IS NULL) OR (frequency_type='EVERY_N_DAYS' AND interval_days > 0 AND weekdays_mask IS NULL AND one_time_date IS NULL) OR (frequency_type='ONCE' AND one_time_date IS NOT NULL AND weekdays_mask IS NULL AND interval_days IS NULL))
      )`,
      `CREATE TABLE IF NOT EXISTS care_plan_adherence (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES care_plan_tasks(id),
        patient_id TEXT NOT NULL REFERENCES patients(id), occurrence_date TEXT NOT NULL, scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RECORDED','COMPLETED','TAKEN','SKIPPED')),
        completed_at TEXT, recorded_at TEXT NOT NULL, patient_note TEXT,
        __v INTEGER NOT NULL DEFAULT 1 CHECK (__v > 0), UNIQUE(task_id,occurrence_date)
      )`,
      `CREATE TABLE IF NOT EXISTS patient_observations (
        id TEXT PRIMARY KEY, adherence_id TEXT NOT NULL UNIQUE REFERENCES care_plan_adherence(id),
        observation_type TEXT NOT NULL, timing_relation TEXT NOT NULL,
        observed_at TEXT NOT NULL, recorded_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS patient_observation_components (
        observation_id TEXT NOT NULL REFERENCES patient_observations(id), component_code TEXT NOT NULL,
        numeric_value NUMERIC(12,4) NOT NULL, unit TEXT NOT NULL,
        PRIMARY KEY(observation_id,component_code)
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_care_plan_active ON care_plans(patient_id,department_id) WHERE status='ACTIVE'",
      'CREATE INDEX IF NOT EXISTS idx_care_plan_patient ON care_plans(patient_id,status,start_date,end_date)',
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_care_task_active_series ON care_plan_tasks(series_id) WHERE status='ACTIVE'",
      'CREATE INDEX IF NOT EXISTS idx_care_task_plan ON care_plan_tasks(plan_id,status,start_date,end_date)',
      'CREATE INDEX IF NOT EXISTS idx_care_task_prescription_item ON care_plan_tasks(prescription_item_id)',
      'CREATE INDEX IF NOT EXISTS idx_care_adherence_patient_date ON care_plan_adherence(patient_id,occurrence_date)',
      'CREATE INDEX IF NOT EXISTS idx_care_adherence_task_date ON care_plan_adherence(task_id,occurrence_date)',
      'CREATE INDEX IF NOT EXISTS idx_patient_observation_time ON patient_observations(observation_type,observed_at)',
      'CREATE INDEX IF NOT EXISTS idx_prescription_items_revision ON prescription_items(prescription_id,prescription_version)'
    ];
    for (const sql of statements) await db.run(sql);

    // Normalize the current authorized prescription revision without inventing
    // missing medication facts. Existing signed clinical_versions remain the
    // historical snapshots; Care Plan tasks can only link to these stable rows.
    const prescriptions = await db.all("SELECT id,rx_content,__v,authorizing_user_id,created_at FROM prescriptions WHERE status='AUTHORIZED'");
    for (const prescription of prescriptions) {
      if ((await db.all('SELECT id FROM prescription_items WHERE prescription_id=? AND prescription_version=? LIMIT 1', [prescription.id, prescription.__v])).length) continue;
      let content;
      try { content = JSON.parse(prescription.rx_content || '{}'); } catch { throw new Error(`PRESCRIPTION_BACKFILL_INVALID_JSON:${prescription.id}`); }
      if (!Array.isArray(content.medications)) throw new Error(`PRESCRIPTION_BACKFILL_MISSING_MEDICATIONS:${prescription.id}`);
      if (content.medications.length && !prescription.authorizing_user_id) throw new Error(`PRESCRIPTION_BACKFILL_MISSING_AUTHOR:${prescription.id}`);
      for (let ordinal = 0; ordinal < content.medications.length; ordinal++) {
        const medication = content.medications[ordinal];
        for (const field of ['drug_id', 'dose', 'frequency', 'duration']) {
          if (typeof medication[field] !== 'string' || !medication[field].trim()) throw new Error(`PRESCRIPTION_BACKFILL_INVALID_ITEM:${prescription.id}:${ordinal}:${field}`);
        }
        const stable = createHash('sha256').update(`${prescription.id}:${prescription.__v}:${ordinal}`).digest('hex').slice(0, 32);
        await db.run(
          `INSERT INTO prescription_items (id,prescription_id,prescription_version,ordinal,drug_id,dose,frequency,duration,instructions,created_by,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [`rxitem-${stable}`, prescription.id, prescription.__v, ordinal, medication.drug_id, medication.dose, medication.frequency, medication.duration, medication.instructions || '', prescription.authorizing_user_id, prescription.created_at]
        );
      }
    }
  }
};
