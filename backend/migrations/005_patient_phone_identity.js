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
  id: '005_patient_phone_identity',
  async up(context) {
    const hasPhone = await hasColumn(context, 'patients', 'phone');
    if (!hasPhone) {
      await context.run(`ALTER TABLE patients ADD COLUMN phone TEXT`);
    }

    await context.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_phone_unique ON patients(phone) WHERE phone IS NOT NULL`);
  }
};
