const {
  PATIENT_GENDERS,
  ACTIVE_ENCOUNTER_PHASES,
  DISCHARGED_ENCOUNTER_PHASE,
  ALL_ENCOUNTER_PHASES,
  NOTE_STATUSES,
  PRESCRIPTION_STATUSES
} = require('../lib/clinicalIntegrity');

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

function sqliteStatements() {
  const genders = quoteList(PATIENT_GENDERS);
  const encounterPhases = quoteList(ALL_ENCOUNTER_PHASES);
  const activeEncounterPhases = quoteList(ACTIVE_ENCOUNTER_PHASES);
  const noteStatuses = quoteList(NOTE_STATUSES);
  const prescriptionStatuses = quoteList(PRESCRIPTION_STATUSES);

  return [
    `CREATE TABLE IF NOT EXISTS data_integrity_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_data_integrity_quarantine_source
      ON data_integrity_quarantine(source_table, source_id, reason)`,
    `CREATE TRIGGER IF NOT EXISTS trg_patients_validate_insert
      BEFORE INSERT ON patients
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 THEN RAISE(ABORT, 'PATIENT_ID_REQUIRED') END;
        SELECT CASE WHEN NEW.name IS NULL OR length(trim(NEW.name)) = 0 THEN RAISE(ABORT, 'PATIENT_NAME_REQUIRED') END;
        SELECT CASE WHEN NEW.dob IS NULL OR length(trim(NEW.dob)) = 0 THEN RAISE(ABORT, 'PATIENT_DOB_REQUIRED') END;
        SELECT CASE WHEN NEW.gender IS NULL OR NEW.gender NOT IN (${genders}) THEN RAISE(ABORT, 'INVALID_PATIENT_GENDER') END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_patients_validate_update
      BEFORE UPDATE ON patients
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 THEN RAISE(ABORT, 'PATIENT_ID_REQUIRED') END;
        SELECT CASE WHEN NEW.name IS NULL OR length(trim(NEW.name)) = 0 THEN RAISE(ABORT, 'PATIENT_NAME_REQUIRED') END;
        SELECT CASE WHEN NEW.dob IS NULL OR length(trim(NEW.dob)) = 0 THEN RAISE(ABORT, 'PATIENT_DOB_REQUIRED') END;
        SELECT CASE WHEN NEW.gender IS NULL OR NEW.gender NOT IN (${genders}) THEN RAISE(ABORT, 'INVALID_PATIENT_GENDER') END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_encounters_validate_insert
      BEFORE INSERT ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN (${encounterPhases}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != '${DISCHARGED_ENCOUNTER_PHASE}' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN (${activeEncounterPhases}) THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_encounters_validate_update
      BEFORE UPDATE ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN (${encounterPhases}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != '${DISCHARGED_ENCOUNTER_PHASE}' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN (${activeEncounterPhases}) THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_clinical_notes_validate_insert
      BEFORE INSERT ON clinical_notes
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'NOTE_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN (${noteStatuses}) THEN RAISE(ABORT, 'INVALID_NOTE_STATUS') END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_clinical_notes_validate_update
      BEFORE UPDATE ON clinical_notes
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'NOTE_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN (${noteStatuses}) THEN RAISE(ABORT, 'INVALID_NOTE_STATUS') END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_prescriptions_validate_insert
      BEFORE INSERT ON prescriptions
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'RX_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN (${prescriptionStatuses}) THEN RAISE(ABORT, 'INVALID_RX_STATUS') END;
      END`,
    `CREATE TRIGGER IF NOT EXISTS trg_prescriptions_validate_update
      BEFORE UPDATE ON prescriptions
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'RX_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN (${prescriptionStatuses}) THEN RAISE(ABORT, 'INVALID_RX_STATUS') END;
      END`
  ];
}

async function ensurePostgresConstraint(context, constraintName, statement) {
  const existing = await context.all(
    `SELECT 1
     FROM pg_constraint
     WHERE conname = ?`,
    [constraintName]
  );

  if (existing.length === 0) {
    await context.run(statement);
  }
}

async function postgresUp(context) {
  const genders = quoteList(PATIENT_GENDERS);
  const encounterPhases = quoteList(ALL_ENCOUNTER_PHASES);
  const activeEncounterPhases = quoteList(ACTIVE_ENCOUNTER_PHASES);
  const noteStatuses = quoteList(NOTE_STATUSES);
  const prescriptionStatuses = quoteList(PRESCRIPTION_STATUSES);

  await context.run(
    `CREATE TABLE IF NOT EXISTS data_integrity_quarantine (
      id BIGSERIAL PRIMARY KEY,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      quarantined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await context.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_data_integrity_quarantine_source
     ON data_integrity_quarantine(source_table, source_id, reason)`
  );

  await ensurePostgresConstraint(
    context,
    'chk_patients_name_nonblank',
    `ALTER TABLE patients
     ADD CONSTRAINT chk_patients_name_nonblank
     CHECK (length(btrim(name)) > 0) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_patients_dob_nonblank',
    `ALTER TABLE patients
     ADD CONSTRAINT chk_patients_dob_nonblank
     CHECK (length(btrim(dob)) > 0) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_patients_gender_valid',
    `ALTER TABLE patients
     ADD CONSTRAINT chk_patients_gender_valid
     CHECK (gender IN (${genders})) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_encounters_patient_id_nonblank',
    `ALTER TABLE encounters
     ADD CONSTRAINT chk_encounters_patient_id_nonblank
     CHECK (length(btrim(patient_id)) > 0) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_encounters_phase_valid',
    `ALTER TABLE encounters
     ADD CONSTRAINT chk_encounters_phase_valid
     CHECK (phase IN (${encounterPhases})) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_encounters_discharge_consistency',
    `ALTER TABLE encounters
     ADD CONSTRAINT chk_encounters_discharge_consistency
     CHECK (
       (is_discharged = 1 AND phase = '${DISCHARGED_ENCOUNTER_PHASE}')
       OR
       (is_discharged = 0 AND phase IN (${activeEncounterPhases}))
     ) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_clinical_notes_status_valid',
    `ALTER TABLE clinical_notes
     ADD CONSTRAINT chk_clinical_notes_status_valid
     CHECK (status IN (${noteStatuses})) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_prescriptions_status_valid',
    `ALTER TABLE prescriptions
     ADD CONSTRAINT chk_prescriptions_status_valid
     CHECK (status IN (${prescriptionStatuses})) NOT VALID`
  );
}

module.exports = {
  id: '002_data_integrity_guards',
  async up(context) {
    if (context.dialect === 'postgres') {
      await postgresUp(context);
      return;
    }

    const statements = sqliteStatements();
    for (const statement of statements) {
      await context.run(statement);
    }
  }
};
