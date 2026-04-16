const { dbDialect, migrateDatabase, resetAndSeedDatabase } = require('../database');
const { SEEDED_PASSWORD, seedDevelopmentDatabase } = require('../seed');
const { run } = require('../database');

const args = process.argv.slice(2);
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'append';
const confirmReset = args.includes('--confirm-reset');

const isProductionLike =
  process.env.NODE_ENV === 'production' ||
  process.env.APP_ENV === 'restricted_web_pilot';

function printSummary() {
  console.log('');
  console.log(`[SEED] Done for ${dbDialect}.`);
  console.log(`[SEED] Admin password: ${SEEDED_PASSWORD}`);
  console.log('[SEED] Seeded accounts: admin_qa');
  console.log('[SEED] No patient, encounter, or clinical records are preloaded.');
  console.log('[SEED] Create staff and patients through the application after first login.');
  console.log('');
}

async function main() {
  if (isProductionLike) {
    console.error('[SEED] Seed script is disabled for restricted_web_pilot / production environments.');
    console.error('[SEED] Use BOOTSTRAP_ADMIN_* env vars for the first admin, then onboard staff and patients through the application.');
    process.exit(1);
  }

  if (mode === 'reset') {
    if (!confirmReset) {
      console.error('[SEED] Reset mode is destructive. Re-run with --confirm-reset.');
      process.exit(1);
    }

    await resetAndSeedDatabase({ seedMode: 'local-dev' });
    printSummary();
    return;
  }

  await migrateDatabase();
  await seedDevelopmentDatabase({ run, dialect: dbDialect, mode: 'local-dev' });
  printSummary();
}

main().catch((err) => {
  console.error('[SEED] Failed:', err);
  process.exit(1);
});
