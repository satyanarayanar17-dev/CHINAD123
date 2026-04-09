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
  id: '003_refresh_token_account_type',
  async up(context) {
    const columnExists = await hasColumn(context, 'refresh_tokens', 'account_type');
    if (!columnExists) {
      await context.run(`ALTER TABLE refresh_tokens ADD COLUMN account_type TEXT`);
    }

    await context.run(
      `UPDATE refresh_tokens
       SET account_type = CASE
         WHEN EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = refresh_tokens.user_id AND u.role = 'PATIENT'
         ) THEN 'PATIENT'
         WHEN EXISTS (
           SELECT 1
           FROM users u
           WHERE u.id = refresh_tokens.user_id AND u.role IN ('DOCTOR', 'NURSE', 'ADMIN')
         ) THEN 'STAFF'
         ELSE account_type
       END
       WHERE account_type IS NULL OR TRIM(account_type) = ''`
    );

    await context.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account_type ON refresh_tokens(account_type)`);
  }
};
