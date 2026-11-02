const { createHash, randomUUID } = require('node:crypto');

module.exports = {
  id: '013_session_and_encounter_integrity',
  async up(db) {
    // Stop for operator repair instead of deleting or choosing clinical records.
    const duplicates = await db.all('SELECT patient_id, COUNT(*) AS count FROM encounters WHERE is_discharged = 0 GROUP BY patient_id HAVING COUNT(*) > 1');
    if (duplicates.length) throw new Error(`Migration 013 blocked: ${duplicates.length} patients have duplicate active encounters. Resolve these records with attribution before retrying.`);
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_encounter_one_active_patient ON encounters(patient_id) WHERE is_discharged = 0');

    const columns = db.dialect === 'postgres'
      ? await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?', ['public', 'refresh_tokens'])
      : await db.all('PRAGMA table_info(refresh_tokens)');
    if (!columns.some(column => column.name === 'session_key')) await db.run('ALTER TABLE refresh_tokens ADD COLUMN session_key TEXT');
    const legacy = await db.all('SELECT id FROM refresh_tokens WHERE session_key IS NULL');
    for (const row of legacy) {
      // Legacy access JWTs exposed these refresh credentials. Reauthentication
      // is necessary; retaining those sessions would preserve that exposure.
      const tokenHash = createHash('sha256').update(row.id).digest('hex');
      await db.run('UPDATE refresh_tokens SET id = ?, session_key = ?, revoked = 1 WHERE id = ?', [tokenHash, randomUUID(), row.id]);
    }
    await db.run('CREATE INDEX IF NOT EXISTS idx_refresh_session_key ON refresh_tokens(session_key)');
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_active_session_key ON refresh_tokens(session_key) WHERE revoked = 0');
  }
};
