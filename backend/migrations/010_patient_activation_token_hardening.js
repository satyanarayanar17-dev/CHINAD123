const bcrypt = require('bcryptjs');

const ACTIVATION_PLACEHOLDER = '__REDACTED__';

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
  id: '010_patient_activation_token_hardening',
  async up(context) {
    const timestampType = context.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT';

    await ensureColumn(context, 'patient_activation_tokens', 'otp_hash', 'TEXT');
    await ensureColumn(context, 'patient_activation_tokens', 'created_at', timestampType);
    await ensureColumn(context, 'patient_activation_tokens', 'consumed_at', timestampType);

    const rowsNeedingHash = await context.all(
      `SELECT patient_id, otp
       FROM patient_activation_tokens
       WHERE otp_hash IS NULL OR otp_hash = ''`
    );

    for (const row of rowsNeedingHash) {
      if (!row.otp || row.otp === ACTIVATION_PLACEHOLDER) {
        continue;
      }

      const otpHash = await bcrypt.hash(String(row.otp), 10);
      await context.run(
        `UPDATE patient_activation_tokens
         SET otp = ?, otp_hash = ?, created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE patient_id = ?`,
        [ACTIVATION_PLACEHOLDER, otpHash, row.patient_id]
      );
    }

    await context.run(
      `UPDATE patient_activation_tokens
       SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)`
    );
  }
};
