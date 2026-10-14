module.exports = {
  id: '017_otp_security',
  async up(context) {
    const columns = context.dialect === 'postgres'
      ? await context.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='patient_otps'")
      : await context.all('PRAGMA table_info(patient_otps)');
    for (const [name, type] of [['challenge_id','TEXT'], ['purpose',"TEXT NOT NULL DEFAULT 'PATIENT_LOGIN'"], ['delivered','INTEGER NOT NULL DEFAULT 0']]) {
      if (!columns.some(c => c.name === name)) await context.run(`ALTER TABLE patient_otps ADD COLUMN ${name} ${type}`);
    }
    const patients = context.dialect === 'postgres'
      ? await context.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='patients'")
      : await context.all('PRAGMA table_info(patients)');
    if (!patients.some(c => c.name === 'phone_verified_at')) await context.run('ALTER TABLE patients ADD COLUMN phone_verified_at TEXT');
    await context.run('CREATE TABLE IF NOT EXISTS otp_rate_buckets (key TEXT PRIMARY KEY, events TEXT NOT NULL)');
  }
};
