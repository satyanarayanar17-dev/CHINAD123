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

async function ensureColumn(context, tableName, columnName, definition) {
  if (await hasColumn(context, tableName, columnName)) {
    return;
  }

  await context.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

module.exports = {
  id: '011_auth_security_hardening',
  async up(context) {
    const timestampType = context.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT';

    await ensureColumn(context, 'users', 'password_reset_at', timestampType);
    await ensureColumn(context, 'patient_activation_tokens', 'failed_attempts', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(context, 'patient_activation_tokens', 'last_failed_at', timestampType);
    await ensureColumn(context, 'patient_activation_tokens', 'locked_until', timestampType);

    await context.run(
      `UPDATE patient_activation_tokens
       SET failed_attempts = COALESCE(failed_attempts, 0)`
    );

    await context.run(
      `CREATE INDEX IF NOT EXISTS idx_patient_activation_tokens_locked_until
       ON patient_activation_tokens(locked_until)`
    );
  }
};
