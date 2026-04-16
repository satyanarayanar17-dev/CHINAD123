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
  id: '009_staff_user_profiles',
  async up(context) {
    const timestampType = context.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT';

    await ensureColumn(context, 'users', 'department', 'TEXT');
    await ensureColumn(context, 'users', 'created_at', timestampType);
    await ensureColumn(context, 'users', 'updated_at', timestampType);

    await context.run(
      `UPDATE users
       SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
           updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`
    );

    await context.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await context.run(`CREATE INDEX IF NOT EXISTS idx_users_department ON users(department)`);
  }
};
