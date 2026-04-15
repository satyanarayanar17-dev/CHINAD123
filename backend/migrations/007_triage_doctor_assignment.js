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
  const columnExists = await hasColumn(context, tableName, columnName);
  if (columnExists) {
    return;
  }

  await context.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

module.exports = {
  id: '007_triage_doctor_assignment',
  async up(context) {
    await ensureColumn(context, 'encounters', 'assigned_doctor_id', 'TEXT');
    await ensureColumn(context, 'encounters', 'chief_complaint', 'TEXT');
    await ensureColumn(context, 'encounters', 'triage_priority', 'TEXT');
    await ensureColumn(context, 'encounters', 'handoff_notes', 'TEXT');
    await ensureColumn(context, 'encounters', 'triage_vitals_json', 'TEXT');
    await ensureColumn(context, 'encounters', 'triaged_by', 'TEXT');
    await ensureColumn(context, 'encounters', 'triaged_at', context.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT');

    await ensureColumn(context, 'notifications', 'target_user_id', 'TEXT');

    await context.run(`CREATE INDEX IF NOT EXISTS idx_encounters_assigned_doctor_id ON encounters(assigned_doctor_id)`);
    await context.run(`CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id ON notifications(target_user_id)`);
  }
};
