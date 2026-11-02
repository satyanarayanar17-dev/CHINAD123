CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'Not specified'
    , mrn TEXT, email TEXT, address TEXT, city TEXT, state TEXT, pin_code TEXT, emergency_contact TEXT, preferred_language TEXT DEFAULT 'en', existing_mrn TEXT, allergies TEXT DEFAULT '', __v INTEGER NOT NULL DEFAULT 1);
CREATE TABLE users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      patient_id TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT, must_change_password INTEGER NOT NULL DEFAULT 0, department TEXT, created_at TEXT, updated_at TEXT, password_reset_at TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );
CREATE TABLE patient_activation_tokens (
      patient_id TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at TEXT NOT NULL, otp_hash TEXT, created_at TEXT, consumed_at TEXT, failed_attempts INTEGER NOT NULL DEFAULT 0, last_failed_at TEXT, locked_until TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );
CREATE TABLE encounters (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      is_discharged INTEGER NOT NULL DEFAULT 0,
      __v INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, assigned_doctor_id TEXT, chief_complaint TEXT, triage_priority TEXT, handoff_notes TEXT, triage_vitals_json TEXT, triaged_by TEXT, triaged_at TEXT, completed_at TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );
CREATE TABLE clinical_notes (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      draft_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      author_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id)
    );
CREATE TABLE prescriptions (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL,
      rx_content TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      authorizing_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      __v INTEGER NOT NULL DEFAULT 1, handed_over_by TEXT, handed_over_at TEXT, dispensing_note TEXT,
      FOREIGN KEY(encounter_id) REFERENCES encounters(id)
    );
CREATE TABLE clinical_drafts (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      etag TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      patient_id TEXT,
      actor_id TEXT,
      target_role TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , target_user_id TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      correlation_id TEXT,
      actor_id TEXT,
      patient_id TEXT,
      action TEXT NOT NULL,
      prior_state TEXT,
      new_state TEXT
    );
CREATE TABLE revoked_tokens (
      user_id TEXT PRIMARY KEY,
      revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0, account_type TEXT, device_name TEXT, created_at TEXT, session_key TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
CREATE INDEX idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX idx_encounters_is_discharged ON encounters(is_discharged);
CREATE INDEX idx_clinical_notes_encounter_id ON clinical_notes(encounter_id);
CREATE INDEX idx_clinical_notes_status ON clinical_notes(status);
CREATE INDEX idx_prescriptions_encounter_id ON prescriptions(encounter_id);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_patient_id ON audit_logs(patient_id);
CREATE UNIQUE INDEX idx_users_patient_id_unique ON users(patient_id) WHERE patient_id IS NOT NULL;
CREATE UNIQUE INDEX idx_patients_phone_unique ON patients(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_encounters_created_at ON encounters(created_at);
CREATE INDEX idx_encounters_lifecycle_status ON encounters(lifecycle_status);
CREATE TABLE data_integrity_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE UNIQUE INDEX idx_data_integrity_quarantine_source
      ON data_integrity_quarantine(source_table, source_id, reason);
CREATE TRIGGER trg_patients_validate_insert
      BEFORE INSERT ON patients
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 THEN RAISE(ABORT, 'PATIENT_ID_REQUIRED') END;
        SELECT CASE WHEN NEW.name IS NULL OR length(trim(NEW.name)) = 0 THEN RAISE(ABORT, 'PATIENT_NAME_REQUIRED') END;
        SELECT CASE WHEN NEW.dob IS NULL OR length(trim(NEW.dob)) = 0 THEN RAISE(ABORT, 'PATIENT_DOB_REQUIRED') END;
        SELECT CASE WHEN NEW.gender IS NULL OR NEW.gender NOT IN ('Male', 'Female', 'Other', 'Not specified') THEN RAISE(ABORT, 'INVALID_PATIENT_GENDER') END;
      END;
CREATE TRIGGER trg_patients_validate_update
      BEFORE UPDATE ON patients
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.id IS NULL OR length(trim(NEW.id)) = 0 THEN RAISE(ABORT, 'PATIENT_ID_REQUIRED') END;
        SELECT CASE WHEN NEW.name IS NULL OR length(trim(NEW.name)) = 0 THEN RAISE(ABORT, 'PATIENT_NAME_REQUIRED') END;
        SELECT CASE WHEN NEW.dob IS NULL OR length(trim(NEW.dob)) = 0 THEN RAISE(ABORT, 'PATIENT_DOB_REQUIRED') END;
        SELECT CASE WHEN NEW.gender IS NULL OR NEW.gender NOT IN ('Male', 'Female', 'Other', 'Not specified') THEN RAISE(ABORT, 'INVALID_PATIENT_GENDER') END;
      END;
CREATE TRIGGER trg_clinical_notes_validate_insert
      BEFORE INSERT ON clinical_notes
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'NOTE_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN ('DRAFT', 'FINALIZED') THEN RAISE(ABORT, 'INVALID_NOTE_STATUS') END;
      END;
CREATE TRIGGER trg_clinical_notes_validate_update
      BEFORE UPDATE ON clinical_notes
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'NOTE_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN ('DRAFT', 'FINALIZED') THEN RAISE(ABORT, 'INVALID_NOTE_STATUS') END;
      END;
CREATE TRIGGER trg_prescriptions_validate_insert
      BEFORE INSERT ON prescriptions
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'RX_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN ('DRAFT', 'AUTHORIZED') THEN RAISE(ABORT, 'INVALID_RX_STATUS') END;
      END;
CREATE TRIGGER trg_prescriptions_validate_update
      BEFORE UPDATE ON prescriptions
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.encounter_id IS NULL OR length(trim(NEW.encounter_id)) = 0 THEN RAISE(ABORT, 'RX_ENCOUNTER_REQUIRED') END;
        SELECT CASE WHEN NEW.status IS NULL OR NEW.status NOT IN ('DRAFT', 'AUTHORIZED') THEN RAISE(ABORT, 'INVALID_RX_STATUS') END;
      END;
CREATE INDEX idx_refresh_tokens_account_type ON refresh_tokens(account_type);
CREATE TRIGGER trg_encounters_validate_insert
      BEFORE INSERT ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION', 'DISCHARGED') THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.lifecycle_status IS NULL OR NEW.lifecycle_status NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION', 'DISCHARGED') THEN RAISE(ABORT, 'INVALID_ENCOUNTER_LIFECYCLE_STATUS') END;
        SELECT CASE WHEN NEW.phase != NEW.lifecycle_status THEN RAISE(ABORT, 'ENCOUNTER_LIFECYCLE_MISMATCH') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != 'DISCHARGED' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION') THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND EXISTS (
            SELECT 1
            FROM encounters
            WHERE patient_id = NEW.patient_id AND is_discharged = 0
          ) THEN RAISE(ABORT, 'DUPLICATE_ACTIVE_ENCOUNTER')
        END;
      END;
CREATE TRIGGER trg_encounters_validate_update
      BEFORE UPDATE ON encounters
      FOR EACH ROW
      BEGIN
        SELECT CASE WHEN NEW.patient_id IS NULL OR length(trim(NEW.patient_id)) = 0 THEN RAISE(ABORT, 'ENCOUNTER_PATIENT_REQUIRED') END;
        SELECT CASE WHEN NEW.phase IS NULL OR NEW.phase NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION', 'DISCHARGED') THEN RAISE(ABORT, 'INVALID_ENCOUNTER_PHASE') END;
        SELECT CASE WHEN NEW.lifecycle_status IS NULL OR NEW.lifecycle_status NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION', 'DISCHARGED') THEN RAISE(ABORT, 'INVALID_ENCOUNTER_LIFECYCLE_STATUS') END;
        SELECT CASE WHEN NEW.phase != NEW.lifecycle_status THEN RAISE(ABORT, 'ENCOUNTER_LIFECYCLE_MISMATCH') END;
        SELECT CASE WHEN NEW.is_discharged NOT IN (0, 1) THEN RAISE(ABORT, 'INVALID_DISCHARGE_FLAG') END;
        SELECT CASE
          WHEN NEW.is_discharged = 1 AND NEW.phase != 'DISCHARGED' THEN RAISE(ABORT, 'DISCHARGE_PHASE_MISMATCH')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND NEW.phase NOT IN ('AWAITING', 'RECEPTION', 'IN_CONSULTATION') THEN RAISE(ABORT, 'ACTIVE_ENCOUNTER_PHASE_REQUIRED')
        END;
        SELECT CASE
          WHEN NEW.is_discharged = 0 AND EXISTS (
            SELECT 1
            FROM encounters
            WHERE patient_id = NEW.patient_id AND is_discharged = 0 AND id != NEW.id
          ) THEN RAISE(ABORT, 'DUPLICATE_ACTIVE_ENCOUNTER')
        END;
      END;
CREATE INDEX idx_encounters_assigned_doctor_id ON encounters(assigned_doctor_id);
CREATE INDEX idx_notifications_target_user_id ON notifications(target_user_id);
CREATE INDEX idx_prescriptions_handed_over_at ON prescriptions(handed_over_at);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_patient_activation_tokens_locked_until
       ON patient_activation_tokens(locked_until);
CREATE UNIQUE INDEX idx_patient_mrn ON patients(mrn);
CREATE TABLE departments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL UNIQUE);
CREATE TABLE practitioner_schedules (
        id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id), department_id TEXT NOT NULL REFERENCES departments(id),
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        slot_minutes INTEGER NOT NULL CHECK (slot_minutes BETWEEN 5 AND 120), room TEXT NOT NULL,
        break_start TEXT, break_end TEXT, __v INTEGER NOT NULL DEFAULT 1, UNIQUE(doctor_id, weekday)
      );
CREATE TABLE practitioner_unavailability (id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, reason TEXT NOT NULL, UNIQUE(doctor_id, date));
CREATE TABLE token_counters (department_id TEXT NOT NULL REFERENCES departments(id), date TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY(department_id, date));
CREATE TABLE queue_entries (
        encounter_id TEXT PRIMARY KEY REFERENCES encounters(id), appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id),
        department_id TEXT NOT NULL REFERENCES departments(id), token TEXT NOT NULL, date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('WAITING','TRIAGE','WAITING_DOCTOR','DOCTOR_READY','CONSULTATION','COMPLETED')),
        priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0,1,2)), checked_in_at TEXT NOT NULL, checked_in_by TEXT NOT NULL REFERENCES users(id),
        identity_verified INTEGER NOT NULL CHECK (identity_verified = 1), triage_started_at TEXT, consultation_started_at TEXT,
        __v INTEGER NOT NULL DEFAULT 1, UNIQUE(department_id, date, token)
      );
CREATE TABLE triage_records (
        id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), version INTEGER NOT NULL,
        data TEXT NOT NULL, nurse_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, amendment_reason TEXT,
        UNIQUE(encounter_id, version)
      );
CREATE TABLE clinical_versions (
        id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, encounter_id TEXT NOT NULL REFERENCES encounters(id),
        version INTEGER NOT NULL, data TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(resource_type, resource_id, version)
      );
CREATE TABLE drug_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, strength TEXT NOT NULL, form TEXT NOT NULL, route TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE diagnosis_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE lab_test_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, department TEXT NOT NULL, unit TEXT NOT NULL, reference_range TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE lab_orders (
        id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id), test_id TEXT NOT NULL REFERENCES lab_test_catalog(id),
        ordered_by TEXT NOT NULL REFERENCES users(id), ordered_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ORDERED','COLLECTED','PROCESSING','AVAILABLE','REVIEWED')), __v INTEGER NOT NULL DEFAULT 1
      );
CREATE TABLE lab_results (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES lab_orders(id), version INTEGER NOT NULL,
        value TEXT NOT NULL, unit TEXT NOT NULL, reference_range TEXT NOT NULL, flag TEXT NOT NULL CHECK (flag IN ('NORMAL','HIGH','LOW','CRITICAL')),
        entered_by TEXT NOT NULL REFERENCES users(id), verified_by TEXT NOT NULL REFERENCES users(id), resulted_at TEXT NOT NULL,
        released INTEGER NOT NULL CHECK (released IN (0,1)), reason TEXT NOT NULL, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
        UNIQUE(order_id, version)
      );
CREATE TABLE journey_events (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), encounter_id TEXT REFERENCES encounters(id),
        appointment_id TEXT REFERENCES appointments(id), code TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), occurred_at TEXT NOT NULL, context TEXT NOT NULL
      );
CREATE INDEX idx_journey_patient ON journey_events(patient_id, occurred_at);
CREATE TABLE patient_otps (phone TEXT PRIMARY KEY, hash TEXT NOT NULL, expires_at TEXT NOT NULL, sent_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE opd_notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), patient_id TEXT REFERENCES patients(id),
        code TEXT NOT NULL, context TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, dedupe_key TEXT UNIQUE
      );
CREATE TABLE sms_outbox (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), code TEXT NOT NULL, context TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, created_at TEXT NOT NULL, dedupe_key TEXT UNIQUE
      );
CREATE UNIQUE INDEX idx_encounter_one_active_patient ON encounters(patient_id) WHERE is_discharged = 0;
CREATE INDEX idx_refresh_session_key ON refresh_tokens(session_key);
CREATE UNIQUE INDEX idx_refresh_active_session_key ON refresh_tokens(session_key) WHERE revoked = 0;
CREATE TABLE prescription_items (
        id TEXT PRIMARY KEY, prescription_id TEXT NOT NULL REFERENCES prescriptions(id),
        prescription_version INTEGER NOT NULL CHECK (prescription_version > 0),
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0), drug_id TEXT NOT NULL REFERENCES drug_catalog(id),
        dose TEXT NOT NULL, frequency TEXT NOT NULL, duration TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
        UNIQUE(prescription_id,prescription_version,ordinal)
      );
CREATE TABLE care_plans (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
        department_id TEXT NOT NULL REFERENCES departments(id),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (timezone = 'Asia/Kolkata'),
        start_date TEXT NOT NULL, end_date TEXT, created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        __v INTEGER NOT NULL DEFAULT 1 CHECK (__v > 0), CHECK (end_date IS NULL OR end_date >= start_date)
      );
CREATE TABLE care_plan_tasks (
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
      );
CREATE TABLE care_plan_adherence (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES care_plan_tasks(id),
        patient_id TEXT NOT NULL REFERENCES patients(id), occurrence_date TEXT NOT NULL, scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RECORDED','COMPLETED','TAKEN','SKIPPED')),
        completed_at TEXT, recorded_at TEXT NOT NULL, patient_note TEXT,
        __v INTEGER NOT NULL DEFAULT 1 CHECK (__v > 0), UNIQUE(task_id,occurrence_date)
      );
CREATE TABLE patient_observations (
        id TEXT PRIMARY KEY, adherence_id TEXT NOT NULL UNIQUE REFERENCES care_plan_adherence(id),
        observation_type TEXT NOT NULL, timing_relation TEXT NOT NULL,
        observed_at TEXT NOT NULL, recorded_at TEXT NOT NULL
      );
CREATE TABLE patient_observation_components (
        observation_id TEXT NOT NULL REFERENCES patient_observations(id), component_code TEXT NOT NULL,
        numeric_value NUMERIC(12,4) NOT NULL, unit TEXT NOT NULL,
        PRIMARY KEY(observation_id,component_code)
      );
CREATE UNIQUE INDEX idx_care_plan_active ON care_plans(patient_id,department_id) WHERE status='ACTIVE';
CREATE INDEX idx_care_plan_patient ON care_plans(patient_id,status,start_date,end_date);
CREATE UNIQUE INDEX idx_care_task_active_series ON care_plan_tasks(series_id) WHERE status='ACTIVE';
CREATE INDEX idx_care_task_plan ON care_plan_tasks(plan_id,status,start_date,end_date);
CREATE INDEX idx_care_task_prescription_item ON care_plan_tasks(prescription_item_id);
CREATE INDEX idx_care_adherence_patient_date ON care_plan_adherence(patient_id,occurrence_date);
CREATE INDEX idx_care_adherence_task_date ON care_plan_adherence(task_id,occurrence_date);
CREATE INDEX idx_patient_observation_time ON patient_observations(observation_type,observed_at);
CREATE INDEX idx_prescription_items_revision ON prescription_items(prescription_id,prescription_version);
CREATE TABLE patient_documents (
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
      );
CREATE TABLE patient_self_records (
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
      );
CREATE INDEX idx_patient_documents_patient_time ON patient_documents(patient_id,clinical_date DESC,created_at DESC);
CREATE INDEX idx_patient_documents_appointment ON patient_documents(appointment_id);
CREATE INDEX idx_patient_self_records_patient_time ON patient_self_records(patient_id,observed_at DESC);
CREATE INDEX idx_patient_self_records_type_time ON patient_self_records(record_type,observed_at DESC);
CREATE TABLE doctor_nurse_assignments (
        doctor_id TEXT NOT NULL REFERENCES users(id),
        nurse_id TEXT NOT NULL REFERENCES users(id),
        PRIMARY KEY (doctor_id, nurse_id)
      );
CREATE TABLE appointments (
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES users(id),
          department_id TEXT NOT NULL REFERENCES departments(id), scheduled_at TEXT NOT NULL, ends_at TEXT NOT NULL, room TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING_CONFIRMATION','CONFIRMED','CHECKED_IN','IN_TRIAGE','READY_FOR_DOCTOR','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW','RESCHEDULE_REQUESTED')),
          reason TEXT NOT NULL, encounter_id TEXT UNIQUE REFERENCES encounters(id), follow_up_of TEXT REFERENCES encounters(id),
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, __v INTEGER NOT NULL DEFAULT 1,
          requested_at TEXT, requested_by_patient_id TEXT, confirmed_at TEXT, confirmed_by_user_id TEXT, confirmed_by_role TEXT, assigned_nurse_id TEXT
        );
CREATE UNIQUE INDEX idx_appointment_slot ON appointments(doctor_id, scheduled_at) WHERE status NOT IN ('CANCELLED', 'NO_SHOW');
CREATE INDEX idx_appointment_patient ON appointments(patient_id, scheduled_at);
