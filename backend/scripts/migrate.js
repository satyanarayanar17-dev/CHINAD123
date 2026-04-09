const { migrateDatabase, pingDatabase, dbDialect } = require('../database');

async function main() {
  await migrateDatabase();
  await pingDatabase();
  console.log(`[DB] Migration check completed for ${dbDialect}.`);
}

main().catch((err) => {
  console.error('[DB] Migration failed:', err);
  process.exit(1);
});
