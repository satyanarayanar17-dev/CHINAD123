const { dbDialect, migrateDatabase, resetAndSeedDatabase } = require('../database');
const { SEEDED_PASSWORD, SEEDED_ACTIVATION_CODE, seedDevelopmentDatabase } = require('../seed');
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
  console.log(`[SEED] Shared demo password: ${SEEDED_PASSWORD}`);
  console.log(`[SEED] Pending activation code for pat-2: ${SEEDED_ACTIVATION_CODE}`);
  console.log('[SEED] Accounts: nurse_qa, doc1_qa, doc2_qa, admin_qa, patient_qa');
  console.log('');
}

async function main() {
  if (isProductionLike) {
    console.error('[SEED] Demo seed data is disabled for restricted_web_pilot / production environments.');
    console.error('[SEED] Use BOOTSTRAP_ADMIN_* env vars for the first admin, then onboard staff and patients through the application.');
    process.exit(1);
  }

  if (mode === 'reset') {
    if (!confirmReset) {
      console.error('[SEED] Reset mode is destructive. Re-run with --confirm-reset.');
      process.exit(1);
    }

    await resetAndSeedDatabase({ seedMode: 'local-demo' });
    printSummary();
    return;
  }

  await migrateDatabase();
  await seedDevelopmentDatabase({ run, dialect: dbDialect, mode: 'local-demo' });
  printSummary();
}

main().catch((err) => {
  console.error('[SEED] Failed:', err);
  process.exit(1);
});
