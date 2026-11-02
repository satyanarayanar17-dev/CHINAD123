module.exports = {
  id: '019_doctor_patient_access',
  async up(context) {
    const columns = context.dialect === 'postgres'
      ? await context.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='patients'")
      : await context.all('PRAGMA table_info(patients)');
    if (!columns.some(column => column.name === 'assigned_doctor_id'))
      await context.run('ALTER TABLE patients ADD COLUMN assigned_doctor_id TEXT REFERENCES users(id) ON DELETE SET NULL');
    if (!columns.some(column => column.name === 'portal_access_enabled'))
      await context.run('ALTER TABLE patients ADD COLUMN portal_access_enabled INTEGER NOT NULL DEFAULT 1 CHECK (portal_access_enabled IN (0,1))');
    await context.run('CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor_id)');
  }
};
