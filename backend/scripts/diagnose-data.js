const { migrateDatabase, dbDialect, all } = require('../database');
const { scanDataIntegrity } = require('../lib/dataIntegrityAudit');

function printHumanSummary(report) {
  console.log(`[DATA-INTEGRITY] Database: ${dbDialect}`);
  console.log(
    `[DATA-INTEGRITY] Invalid rows => patients=${report.counts.invalidPatients}, encounters=${report.counts.invalidEncounters}, queue=${report.counts.malformedQueueRows}, notes=${report.counts.invalidNotes}, prescriptions=${report.counts.invalidPrescriptions}`
  );
  console.log(
    `[DATA-INTEGRITY] Legacy schema drift=${report.counts.legacySchemaDrift}, duplicate_active_encounter_patients=${report.counts.duplicateActiveEncounterPatients}`
  );

  for (const issue of report.invalidPatients) {
    console.log(`[INVALID] patients:${issue.id} reasons=${issue.reasons.join(',')}`);
  }

  for (const issue of report.invalidEncounters) {
    console.log(`[INVALID] encounters:${issue.id} reasons=${issue.reasons.join(',')}`);
  }

  for (const issue of report.invalidNotes) {
    console.log(`[INVALID] clinical_notes:${issue.id} reasons=${issue.reasons.join(',')}`);
  }

  for (const issue of report.invalidPrescriptions) {
    console.log(`[INVALID] prescriptions:${issue.id} reasons=${issue.reasons.join(',')}`);
  }

  for (const issue of report.malformedQueueRows) {
    console.log(`[INVALID] queue:${issue.id} reasons=${issue.reasons.join(',')}`);
  }

  for (const mismatch of report.legacyShapeMismatches) {
    console.log(
      `[LEGACY] ${mismatch.table}:${mismatch.id} field=${mismatch.field} from=${JSON.stringify(mismatch.from)} to=${JSON.stringify(mismatch.to)}`
    );
  }

  for (const duplicate of report.duplicateActiveEncounterPatients) {
    console.log(`[DUPLICATE_ACTIVE] patient=${duplicate.patientId} encounters=${duplicate.encounterIds.join(',')}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  await migrateDatabase();
  const report = await scanDataIntegrity({ all });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanSummary(report);
}

main().catch((err) => {
  console.error('[DATA-INTEGRITY] Diagnose failed:', err);
  process.exit(1);
});
