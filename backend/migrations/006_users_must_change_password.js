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

module.exports = {
  id: '006_users_must_change_password',
  async up(context) {
    const columnExists = await hasColumn(context, 'users', 'must_change_password');
    if (columnExists) {
      return;
    }

    await context.run(
      `ALTER TABLE users
       ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`
    );
  }
};
