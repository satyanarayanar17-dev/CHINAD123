module.exports = {
  id: '016_appointment_requests',
  async up(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS doctor_nurse_assignments (
        doctor_id TEXT NOT NULL REFERENCES users(id),
        nurse_id TEXT NOT NULL REFERENCES users(id),
        PRIMARY KEY (doctor_id, nurse_id)
      )
    `);

    if (context.dialect === 'postgres') {
      await context.run(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check`);
      await context.run(`ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('PENDING_CONFIRMATION','CONFIRMED','CHECKED_IN','IN_TRIAGE','READY_FOR_DOCTOR','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW','RESCHEDULE_REQUESTED'))`);
      
      const cols = ['requested_at', 'requested_by_patient_id', 'confirmed_at', 'confirmed_by_user_id', 'confirmed_by_role', 'assigned_nurse_id'];
      for (const col of cols) {
        const type = (col === 'requested_at' || col === 'confirmed_at') ? 'TIMESTAMPTZ' : 'TEXT';
        try {
          await context.run(`ALTER TABLE appointments ADD COLUMN ${col} ${type}`);
        } catch (err) {
          // Ignore if column exists
        }
      }
    } else {
      await context.run(`PRAGMA foreign_keys=OFF`);
      await context.run(`PRAGMA legacy_alter_table=ON`);
      await context.run(`DROP TABLE IF EXISTS appointments_old`);
      await context.run(`ALTER TABLE appointments RENAME TO appointments_old`);
      await context.run(`PRAGMA legacy_alter_table=OFF`);
      await context.run(`
        CREATE TABLE appointments (
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), doctor_id TEXT NOT NULL REFERENCES users(id),
          department_id TEXT NOT NULL REFERENCES departments(id), scheduled_at TEXT NOT NULL, ends_at TEXT NOT NULL, room TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING_CONFIRMATION','CONFIRMED','CHECKED_IN','IN_TRIAGE','READY_FOR_DOCTOR','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW','RESCHEDULE_REQUESTED')),
          reason TEXT NOT NULL, encounter_id TEXT UNIQUE REFERENCES encounters(id), follow_up_of TEXT REFERENCES encounters(id),
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, __v INTEGER NOT NULL DEFAULT 1,
          requested_at TEXT, requested_by_patient_id TEXT, confirmed_at TEXT, confirmed_by_user_id TEXT, confirmed_by_role TEXT, assigned_nurse_id TEXT
        )
      `);
      await context.run(`
        INSERT INTO appointments (id, patient_id, doctor_id, department_id, scheduled_at, ends_at, room, status, reason, encounter_id, follow_up_of, created_by, created_at, __v)
        SELECT id, patient_id, doctor_id, department_id, scheduled_at, ends_at, room, status, reason, encounter_id, follow_up_of, created_by, created_at, __v FROM appointments_old
      `);
      await context.run(`DROP TABLE appointments_old`);
      await context.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_slot ON appointments(doctor_id, scheduled_at) WHERE status NOT IN ('CANCELLED', 'NO_SHOW')`);
      await context.run(`CREATE INDEX IF NOT EXISTS idx_appointment_patient ON appointments(patient_id, scheduled_at)`);
      await context.run(`PRAGMA foreign_keys=ON`);
    }
  }
};
