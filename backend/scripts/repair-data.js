const { migrateDatabase, dbDialect, all, run } = require('../database');
const { repairData, formatIntegrityReport } = require('../lib/dataIntegrityAudit');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const asJson = args.includes('--json');

  await migrateDatabase();
  const report = await repairData(
    { all, run, dialect: dbDialect },
    { dryRun: !apply }
  );

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!apply) {
    console.log('[DATA-INTEGRITY] Dry run only. Re-run with --apply to persist repairs and quarantine invalid rows.');
  } else {
    console.log('[DATA-INTEGRITY] Applying deterministic repairs and quarantine actions.');
  }

  console.log(formatIntegrityReport(report));
}

main().catch((err) => {
  console.error('[DATA-INTEGRITY] Repair failed:', err);
  process.exit(1);
});
