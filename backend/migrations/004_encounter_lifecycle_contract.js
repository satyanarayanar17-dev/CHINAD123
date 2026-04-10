const {
  ACTIVE_ENCOUNTER_PHASES,
  ALL_ENCOUNTER_PHASES,
  DISCHARGED_ENCOUNTER_PHASE,
  ENCOUNTER_LIFECYCLE_STATUSES
} = require('../lib/clinicalIntegrity');

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
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

async function backfillLifecycleStatus(context) {
  await context.run(
    `UPDATE encounters
     SET lifecycle_status = CASE
       WHEN is_discharged = 1 OR UPPER(TRIM(phase)) IN ('${DISCHARGED_ENCOUNTER_PHASE}', 'CLOSED') THEN '${DISCHARGED_ENCOUNTER_PHASE}'
       WHEN UPPER(TRIM(phase)) IN (${quoteList(ACTIVE_ENCOUNTER_PHASES)}) THEN UPPER(TRIM(phase))
       ELSE lifecycle_status
     END
     WHERE lifecycle_status IS NULL OR TRIM(lifecycle_status) = '' OR UPPER(TRIM(lifecycle_status)) != CASE
       WHEN is_discharged = 1 OR UPPER(TRIM(phase)) IN ('${DISCHARGED_ENCOUNTER_PHASE}', 'CLOSED') THEN '${DISCHARGED_ENCOUNTER_PHASE}'
       WHEN UPPER(TRIM(phase)) IN (${quoteList(ACTIVE_ENCOUNTER_PHASES)}) THEN UPPER(TRIM(phase))
       ELSE UPPER(TRIM(lifecycle_status))
     END`
  );
}

async function sqliteUp(context) {
  const columnExists = await hasColumn(context, 'encounters', 'lifecycle_status');
  if (!columnExists) {
    await context.run(`ALTER TABLE encounters ADD COLUMN lifecycle_status TEXT`);
  }

  await backfillLifecycleStatus(context);
  await context.run(`CREATE INDEX IF NOT EXISTS idx_encounters_lifecycle_status ON encounters(lifecycle_status)`);

  await context.run(`DROP TRIGGER IF EXISTS trg_encounters_validate_insert`);
  await context.run(`DROP TRIGGER IF EXISTS trg_encounters_validate_update`);

  const encounterPhases = quoteList(ALL_ENCOUNTER_PHASES);
  const lifecycleStatuses = quoteList(ENCOUNTER_LIFECYCLE_STATUSES);
  const activeEncounterPhases = quoteList(ACTIVE_ENCOUNTER_PHASES);

  await context.run(
    `CREATE TRIGGER IF NOT EXISTS trg_encounters_validate_insert
      BEFORE INSERT ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN (${encounterPhases}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.lifecycle_status IS NULL OR NEW.lifecycle_status NOT IN (${lifecycleStatuses}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_LIFECYCLE_STATUS') END;
        SELECT CASE WHEN NEW.phase != NEW.lifecycle_status THEN RAISE(ABORT, 'ENCOUNTER_LIFECYCLE_MISMATCH') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != '${DISCHARGED_ENCOUNTER_PHASE}' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN (${activeEncounterPhases}) THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND EXISTS (
            SELECT 1
            FROM encounters
            WHERE patient_id = NEW.patient_id AND is_discharged = 0
          ) THEN RAISE(ABORT, 'DUPLICATE_ACTIVE_ENCOUNTER')
        END;
      END`
  );

  await context.run(
    `CREATE TRIGGER IF NOT EXISTS trg_encounters_validate_update
      BEFORE UPDATE ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN (${encounterPhases}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.lifecycle_status IS NULL OR NEW.lifecycle_status NOT IN (${lifecycleStatuses}) THEN RAISE(ABORT, 'INVALID_ENCOUNTER_LIFECYCLE_STATUS') END;
        SELECT CASE WHEN NEW.phase != NEW.lifecycle_status THEN RAISE(ABORT, 'ENCOUNTER_LIFECYCLE_MISMATCH') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != '${DISCHARGED_ENCOUNTER_PHASE}' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN (${activeEncounterPhases}) THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND EXISTS (
            SELECT 1
            FROM encounters
            WHERE patient_id = NEW.patient_id AND is_discharged = 0 AND id != NEW.id
          ) THEN RAISE(ABORT, 'DUPLICATE_ACTIVE_ENCOUNTER')
        END;
      END`
  );
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

async function ensurePostgresTrigger(context, triggerName, statement) {
  const existing = await context.all(
    `SELECT 1
     FROM pg_trigger
     WHERE tgname = ?`,
    [triggerName]
  );

  if (existing.length === 0) {
    await context.run(statement);
  }
}

async function postgresUp(context) {
  const columnExists = await hasColumn(context, 'encounters', 'lifecycle_status');
  if (!columnExists) {
    await context.run(`ALTER TABLE encounters ADD COLUMN lifecycle_status TEXT`);
  }

  await backfillLifecycleStatus(context);
  await context.run(`CREATE INDEX IF NOT EXISTS idx_encounters_lifecycle_status ON encounters(lifecycle_status)`);

  await ensurePostgresConstraint(
    context,
    'chk_encounters_lifecycle_status_valid',
    `ALTER TABLE encounters
     ADD CONSTRAINT chk_encounters_lifecycle_status_valid
     CHECK (lifecycle_status IN (${quoteList(ENCOUNTER_LIFECYCLE_STATUSES)})) NOT VALID`
  );

  await ensurePostgresConstraint(
    context,
    'chk_encounters_phase_lifecycle_match',
    `ALTER TABLE encounters
     ADD CONSTRAINT chk_encounters_phase_lifecycle_match
     CHECK (phase = lifecycle_status) NOT VALID`
  );

  await context.run(
    `CREATE OR REPLACE FUNCTION prevent_duplicate_active_encounter()
     RETURNS TRIGGER AS $$
     BEGIN
       IF NEW.is_discharged = 0 AND EXISTS (
         SELECT 1
         FROM encounters
         WHERE patient_id = NEW.patient_id
           AND is_discharged = 0
           AND id <> NEW.id
       ) THEN
         RAISE EXCEPTION 'DUPLICATE_ACTIVE_ENCOUNTER';
       END IF;

       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql`
  );

  await ensurePostgresTrigger(
    context,
    'trg_encounters_single_active',
    `CREATE TRIGGER trg_encounters_single_active
     BEFORE INSERT OR UPDATE ON encounters
     FOR EACH ROW
     EXECUTE FUNCTION prevent_duplicate_active_encounter()`
  );
}

module.exports = {
  id: '004_encounter_lifecycle_contract',
  async up(context) {
    if (context.dialect === 'postgres') {
      await postgresUp(context);
      return;
    }

    await sqliteUp(context);
  }
};
