const { logEvent } = require('../lib/logger');

module.exports = {
  id: '015_patient_documents_and_self_records',
  async up(db) {
    logEvent('info', 'migration_start', { version: '015_patient_documents_and_self_records' });
    const statements = [
      `CREATE TABLE IF NOT EXISTS patient_documents (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        appointment_id TEXT REFERENCES appointments(id),
        uploaded_by TEXT NOT NULL REFERENCES users(id),
        document_type TEXT NOT NULL CHECK (document_type IN ('LAB_REPORT','SCAN','PRESCRIPTION','DISCHARGE_SUMMARY','REFERRAL','OTHER_MEDICAL_RECORD')),
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
        storage_provider TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        patient_note TEXT,
        clinical_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS patient_self_records (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        record_type TEXT NOT NULL CHECK (record_type IN ('GLUCOSE','BLOOD_PRESSURE','WEIGHT','TEMPERATURE','PULSE','SPO2','ACTIVITY')),
        timing_context TEXT,
        numeric_value NUMERIC(12,4),
        secondary_numeric_value NUMERIC(12,4),
        unit TEXT,
        activity_name TEXT,
        duration_minutes INTEGER,
        observed_at TEXT NOT NULL,
        patient_note TEXT,
        provenance TEXT NOT NULL DEFAULT 'PATIENT_SELF_RECORDED' CHECK (provenance='PATIENT_SELF_RECORDED'),
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        CHECK (
          (record_type='ACTIVITY' AND activity_name IS NOT NULL AND duration_minutes > 0 AND numeric_value IS NULL AND secondary_numeric_value IS NULL AND unit IS NULL)
          OR
          (record_type='BLOOD_PRESSURE' AND numeric_value IS NOT NULL AND secondary_numeric_value IS NOT NULL AND unit='mmHg' AND activity_name IS NULL AND duration_minutes IS NULL)
          OR
          (record_type IN ('GLUCOSE','WEIGHT','TEMPERATURE','PULSE','SPO2') AND numeric_value IS NOT NULL AND secondary_numeric_value IS NULL AND unit IS NOT NULL AND activity_name IS NULL AND duration_minutes IS NULL)
        ),
        CHECK ((record_type='GLUCOSE' AND timing_context IN ('FASTING','BEFORE_BREAKFAST','AFTER_BREAKFAST','BEFORE_LUNCH','AFTER_LUNCH','BEFORE_DINNER','POST_DINNER','BEDTIME','RANDOM')) OR (record_type!='GLUCOSE' AND timing_context IS NULL))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_time ON patient_documents(patient_id,clinical_date DESC,created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_patient_documents_appointment ON patient_documents(appointment_id)',
      'CREATE INDEX IF NOT EXISTS idx_patient_self_records_patient_time ON patient_self_records(patient_id,observed_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_patient_self_records_type_time ON patient_self_records(record_type,observed_at DESC)'
    ];
    for (const sql of statements) await db.run(sql);
  }
};
