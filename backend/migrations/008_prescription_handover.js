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
  id: '008_prescription_handover',
  async up(context) {
    await ensureColumn(context, 'prescriptions', 'handed_over_by', 'TEXT');
    await ensureColumn(context, 'prescriptions', 'handed_over_at', context.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT');
    await ensureColumn(context, 'prescriptions', 'dispensing_note', 'TEXT');

    await context.run(`CREATE INDEX IF NOT EXISTS idx_prescriptions_handed_over_at ON prescriptions(handed_over_at)`);
  }
};
