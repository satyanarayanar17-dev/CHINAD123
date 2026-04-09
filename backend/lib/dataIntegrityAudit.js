const {
  buildUnknownPatientName,
  isIsoDateOnly,
  normalizeEncounterPhase,
  normalizeIdentifier,
  normalizeNoteStatus,
  normalizePatientGender,
  normalizePrescriptionStatus,
  serializeQueueSlot,
  trimToNull,
  validateEncounterLifecycle
} = require('./clinicalIntegrity');

function buildInsertIgnoreSql(dialect, table, columns, conflictColumns) {
  const columnList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');

  if (dialect === 'postgres') {
    return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`;
  }

  return `INSERT OR IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
}

async function insertQuarantineRecord(context, record) {
  const columns = ['source_table', 'source_id', 'reason', 'snapshot'];
  const values = columns.map((column) => record[column]);
  await context.run(
    buildInsertIgnoreSql(context.dialect, 'data_integrity_quarantine', columns, ['source_table', 'source_id', 'reason']),
    values
  );
}

async function updateRow(context, table, id, updates) {
  const columns = Object.keys(updates);
  if (columns.length === 0) {
    return;
  }

  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  await context.run(
    `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    [...columns.map((column) => updates[column]), id]
  );
}

function normalizeRawStatusForComparison(value) {
  const trimmed = trimToNull(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

async function scanDataIntegrity(context) {
  const patients = await context.all(
    `SELECT id, name, dob, gender
     FROM patients
     ORDER BY id ASC`
  );
  const encounters = await context.all(
    `SELECT id, patient_id, phase, is_discharged, __v, created_at
     FROM encounters
     ORDER BY created_at ASC, id ASC`
  );
  const notes = await context.all(
    `SELECT cn.*, e.id AS linked_encounter_id, e.patient_id, e.phase AS encounter_phase, e.is_discharged, p.id AS linked_patient_record_id
     FROM clinical_notes cn
     LEFT JOIN encounters e ON e.id = cn.encounter_id
     LEFT JOIN patients p ON p.id = e.patient_id
     ORDER BY cn.id ASC`
  );
  const prescriptions = await context.all(
    `SELECT p.*, e.id AS linked_encounter_id, e.patient_id, e.phase AS encounter_phase, e.is_discharged, pt.id AS linked_patient_record_id
     FROM prescriptions p
     LEFT JOIN encounters e ON e.id = p.encounter_id
     LEFT JOIN patients pt ON pt.id = e.patient_id
     ORDER BY p.id ASC`
  );
  const queueRows = await context.all(
    `SELECT e.id AS encounter_id, e.patient_id, e.phase, e.is_discharged, e.__v, p.id AS patient_record_id, p.name, p.dob, p.gender
     FROM encounters e
     LEFT JOIN patients p ON p.id = e.patient_id
     WHERE e.is_discharged = 0
     ORDER BY e.created_at ASC, e.id ASC`
  );

  const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
  const encounterCounts = new Map();
  const invalidPatients = [];
  const invalidEncounters = [];
  const invalidNotes = [];
  const invalidPrescriptions = [];
  const malformedQueueRows = [];
  const legacyShapeMismatches = [];
  const duplicateActiveEncounterPatients = [];

  for (const patient of patients) {
    const reasons = [];
    const normalizedGender = normalizePatientGender(patient.gender);

    if (!normalizeIdentifier(patient.id)) {
      reasons.push('missing_patient_id');
    }

    if (!trimToNull(patient.name)) {
      reasons.push('missing_patient_name');
    }

    if (!isIsoDateOnly(patient.dob)) {
      reasons.push('invalid_patient_dob');
    }

    if (!normalizedGender) {
      reasons.push('invalid_patient_gender');
    }

    if (reasons.length > 0) {
      invalidPatients.push({ id: patient.id, reasons, row: patient });
    }

    if (normalizedGender && trimToNull(patient.gender) !== normalizedGender) {
      legacyShapeMismatches.push({
        table: 'patients',
        id: patient.id,
        field: 'gender',
        from: patient.gender,
        to: normalizedGender,
        reason: 'patient_gender_normalization'
      });
    }
  }

  for (const encounter of encounters) {
    const reasons = [];
    const lifecycle = validateEncounterLifecycle(encounter);
    const normalizedPhase = normalizeEncounterPhase(encounter.phase);
    const rawPhase = trimToNull(encounter.phase);

    if (!patientsById.has(encounter.patient_id)) {
      reasons.push('orphan_patient_reference');
    }

    if (!lifecycle.valid) {
      reasons.push(...lifecycle.errors);
    }

    if (reasons.length > 0) {
      invalidEncounters.push({ id: encounter.id, reasons, row: encounter });
    }

    if (normalizedPhase && rawPhase && rawPhase !== normalizedPhase) {
      legacyShapeMismatches.push({
        table: 'encounters',
        id: encounter.id,
        field: 'phase',
        from: encounter.phase,
        to: normalizedPhase,
        reason: 'encounter_phase_normalization'
      });
    }

    if (Number(encounter.is_discharged) === 0 && normalizeIdentifier(encounter.patient_id)) {
      const current = encounterCounts.get(encounter.patient_id) || [];
      current.push(encounter.id);
      encounterCounts.set(encounter.patient_id, current);
    }
  }

  for (const [patientId, encounterIds] of encounterCounts.entries()) {
    if (encounterIds.length > 1) {
      duplicateActiveEncounterPatients.push({ patientId, encounterIds });
    }
  }

  for (const note of notes) {
    const reasons = [];
    const normalizedStatus = normalizeNoteStatus(note.status);

    if (!note.linked_encounter_id || !note.patient_id || !note.linked_patient_record_id) {
      reasons.push('orphan_encounter_reference');
    } else {
      const encounterState = validateEncounterLifecycle({
        patient_id: note.patient_id,
        phase: note.encounter_phase,
        is_discharged: note.is_discharged
      });

      if (!encounterState.valid) {
        reasons.push('linked_malformed_encounter');
      }
    }

    if (!normalizedStatus) {
      reasons.push('invalid_note_status');
    }

    if (reasons.length > 0) {
      invalidNotes.push({ id: note.id, reasons, row: note });
    }

    if (normalizedStatus && normalizeRawStatusForComparison(note.status) !== note.status) {
      legacyShapeMismatches.push({
        table: 'clinical_notes',
        id: note.id,
        field: 'status',
        from: note.status,
        to: normalizedStatus,
        reason: 'note_status_normalization'
      });
    }
  }

  for (const prescription of prescriptions) {
    const reasons = [];
    const normalizedStatus = normalizePrescriptionStatus(prescription.status);

    if (!prescription.linked_encounter_id || !prescription.patient_id || !prescription.linked_patient_record_id) {
      reasons.push('orphan_encounter_reference');
    } else {
      const encounterState = validateEncounterLifecycle({
        patient_id: prescription.patient_id,
        phase: prescription.encounter_phase,
        is_discharged: prescription.is_discharged
      });

      if (!encounterState.valid) {
        reasons.push('linked_malformed_encounter');
      }
    }

    if (!normalizedStatus) {
      reasons.push('invalid_prescription_status');
    }

    if (reasons.length > 0) {
      invalidPrescriptions.push({ id: prescription.id, reasons, row: prescription });
    }

    if (normalizedStatus && normalizeRawStatusForComparison(prescription.status) !== prescription.status) {
      legacyShapeMismatches.push({
        table: 'prescriptions',
        id: prescription.id,
        field: 'status',
        from: prescription.status,
        to: normalizedStatus,
        reason: 'prescription_status_normalization'
      });
    }
  }

  for (const queueRow of queueRows) {
    const serialized = serializeQueueSlot(queueRow);
    if (!serialized.slot) {
      malformedQueueRows.push({
        id: queueRow.encounter_id,
        reasons: serialized.errors,
        row: queueRow
      });
    }
  }

  return {
    snapshots: {
      patients,
      encounters,
      notes,
      prescriptions,
      queueRows
    },
    counts: {
      invalidPatients: invalidPatients.length,
      invalidEncounters: invalidEncounters.length,
      malformedQueueRows: malformedQueueRows.length,
      invalidNotes: invalidNotes.length,
      invalidPrescriptions: invalidPrescriptions.length,
      duplicateActiveEncounterPatients: duplicateActiveEncounterPatients.length,
      legacyShapeMismatches: legacyShapeMismatches.length
    },
    invalidPatients,
    invalidEncounters,
    malformedQueueRows,
    invalidNotes,
    invalidPrescriptions,
    duplicateActiveEncounterPatients,
    legacyShapeMismatches
  };
}

function createResult(dryRun) {
  return {
    dryRun,
    repaired: [],
    quarantined: [],
    manualReview: [],
    before: null,
    after: null
  };
}

function addManualReview(result, entry) {
  const key = `${entry.table}:${entry.id}:${entry.reason}`;
  if (result.manualReview.some((item) => `${item.table}:${item.id}:${item.reason}` === key)) {
    return;
  }

  result.manualReview.push(entry);
}

function hasRecordedRepair(result, table, id) {
  return result.repaired.some((repair) => repair.table === table && repair.id === id);
}

async function recordRepair(result, context, repair) {
  result.repaired.push(repair);
  if (result.dryRun) {
    return;
  }

  await updateRow(context, repair.table, repair.id, repair.updates);
}

async function quarantineRow(result, context, quarantine) {
  result.quarantined.push(quarantine);
  if (result.dryRun) {
    return;
  }

  await insertQuarantineRecord(context, {
    source_table: quarantine.table,
    source_id: quarantine.id,
    reason: quarantine.reason,
    snapshot: JSON.stringify(quarantine.snapshot)
  });
  await context.run(quarantine.deleteSql, quarantine.deleteParams);
}

async function repairPatients(result, context, scan) {
  for (const issue of scan.invalidPatients) {
    const updates = {};
    const patientId = issue.id;

    if (!normalizeIdentifier(patientId)) {
      addManualReview(result, {
        table: 'patients',
        id: patientId || 'UNKNOWN_PATIENT',
        reason: 'missing_patient_id',
        details: 'Cannot repair a patient row without a stable primary key.'
      });
      continue;
    }

    if (issue.reasons.includes('missing_patient_name')) {
      updates.name = buildUnknownPatientName(patientId);
    }

    if (issue.reasons.includes('invalid_patient_gender')) {
      updates.gender = 'Not specified';
    }

    if (Object.keys(updates).length > 0) {
      await recordRepair(result, context, {
        table: 'patients',
        id: patientId,
        updates,
        reason: issue.reasons.join(', ')
      });
    }

    if (issue.reasons.includes('invalid_patient_dob')) {
      addManualReview(result, {
        table: 'patients',
        id: patientId,
        reason: 'invalid_patient_dob',
        details: 'DOB cannot be inferred safely and requires manual correction.'
      });
    }
  }
}

async function repairEncounters(result, context, scan) {
  const notesByEncounter = new Map();
  const prescriptionsByEncounter = new Map();

  for (const note of scan.snapshots.notes) {
    const current = notesByEncounter.get(note.encounter_id) || [];
    current.push(note);
    notesByEncounter.set(note.encounter_id, current);
  }

  for (const prescription of scan.snapshots.prescriptions) {
    const current = prescriptionsByEncounter.get(prescription.encounter_id) || [];
    current.push(prescription);
    prescriptionsByEncounter.set(prescription.encounter_id, current);
  }

  for (const issue of scan.invalidEncounters) {
    const encounter = issue.row;

    if (issue.reasons.includes('orphan_patient_reference') || issue.reasons.includes('missing_patient_id')) {
      for (const note of notesByEncounter.get(encounter.id) || []) {
        await quarantineRow(result, context, {
          table: 'clinical_notes',
          id: note.id,
          reason: 'orphaned_by_invalid_encounter',
          snapshot: note,
          deleteSql: `DELETE FROM clinical_notes WHERE id = ?`,
          deleteParams: [note.id]
        });
      }

      for (const prescription of prescriptionsByEncounter.get(encounter.id) || []) {
        await quarantineRow(result, context, {
          table: 'prescriptions',
          id: prescription.id,
          reason: 'orphaned_by_invalid_encounter',
          snapshot: prescription,
          deleteSql: `DELETE FROM prescriptions WHERE id = ?`,
          deleteParams: [prescription.id]
        });
      }

      await quarantineRow(result, context, {
        table: 'encounters',
        id: encounter.id,
        reason: 'orphan_patient_reference',
        snapshot: encounter,
        deleteSql: `DELETE FROM encounters WHERE id = ?`,
        deleteParams: [encounter.id]
      });
      continue;
    }

    const updates = {};
    const normalizedPhase = normalizeEncounterPhase(encounter.phase);
    const dischargeFlag = Number(encounter.is_discharged) === 1 ? 1 : 0;

    if (dischargeFlag === 1 && encounter.phase !== 'DISCHARGED') {
      updates.phase = 'DISCHARGED';
    } else if (dischargeFlag === 0 && normalizedPhase === 'DISCHARGED') {
      updates.phase = 'DISCHARGED';
      updates.is_discharged = 1;
    } else if (normalizedPhase && encounter.phase !== normalizedPhase) {
      updates.phase = normalizedPhase;
    }

    if (!normalizedPhase && dischargeFlag === 1) {
      updates.phase = 'DISCHARGED';
    }

    if (Object.keys(updates).length > 0) {
      await recordRepair(result, context, {
        table: 'encounters',
        id: encounter.id,
        updates,
        reason: issue.reasons.join(', ')
      });
      continue;
    }

    addManualReview(result, {
      table: 'encounters',
      id: encounter.id,
      reason: issue.reasons.join(', '),
      details: 'Encounter state could not be repaired safely and needs manual review.'
    });
  }

  for (const duplicate of scan.duplicateActiveEncounterPatients) {
    addManualReview(result, {
      table: 'encounters',
      id: duplicate.patientId,
      reason: 'duplicate_active_encounters',
      details: `Multiple active encounters detected: ${duplicate.encounterIds.join(', ')}`
    });
  }
}

async function repairNotesAndPrescriptions(result, context, scan) {
  for (const issue of scan.invalidNotes) {
    const note = issue.row;
    const normalizedStatus = normalizeNoteStatus(note.status);

    if (issue.reasons.includes('orphan_encounter_reference')) {
      await quarantineRow(result, context, {
        table: 'clinical_notes',
        id: note.id,
        reason: 'orphan_encounter_reference',
        snapshot: note,
        deleteSql: `DELETE FROM clinical_notes WHERE id = ?`,
        deleteParams: [note.id]
      });
      continue;
    }

    if (normalizedStatus && note.status !== normalizedStatus) {
      await recordRepair(result, context, {
        table: 'clinical_notes',
        id: note.id,
        updates: { status: normalizedStatus },
        reason: issue.reasons.join(', ')
      });
      continue;
    }

    if (issue.reasons.includes('linked_malformed_encounter')) {
      addManualReview(result, {
        table: 'clinical_notes',
        id: note.id,
        reason: 'linked_malformed_encounter',
        details: 'Note is attached to an encounter that still needs manual review.'
      });
      continue;
    }

    await quarantineRow(result, context, {
      table: 'clinical_notes',
      id: note.id,
      reason: 'invalid_note_status',
      snapshot: note,
      deleteSql: `DELETE FROM clinical_notes WHERE id = ?`,
      deleteParams: [note.id]
    });
  }

  for (const issue of scan.invalidPrescriptions) {
    const prescription = issue.row;
    const normalizedStatus = normalizePrescriptionStatus(prescription.status);

    if (issue.reasons.includes('orphan_encounter_reference')) {
      await quarantineRow(result, context, {
        table: 'prescriptions',
        id: prescription.id,
        reason: 'orphan_encounter_reference',
        snapshot: prescription,
        deleteSql: `DELETE FROM prescriptions WHERE id = ?`,
        deleteParams: [prescription.id]
      });
      continue;
    }

    if (normalizedStatus && prescription.status !== normalizedStatus) {
      await recordRepair(result, context, {
        table: 'prescriptions',
        id: prescription.id,
        updates: { status: normalizedStatus },
        reason: issue.reasons.join(', ')
      });
      continue;
    }

    if (issue.reasons.includes('linked_malformed_encounter')) {
      addManualReview(result, {
        table: 'prescriptions',
        id: prescription.id,
        reason: 'linked_malformed_encounter',
        details: 'Prescription is attached to an encounter that still needs manual review.'
      });
      continue;
    }

    await quarantineRow(result, context, {
      table: 'prescriptions',
      id: prescription.id,
      reason: 'invalid_prescription_status',
      snapshot: prescription,
      deleteSql: `DELETE FROM prescriptions WHERE id = ?`,
      deleteParams: [prescription.id]
    });
  }

  for (const note of scan.snapshots.notes) {
    const normalizedStatus = normalizeNoteStatus(note.status);
    if (!normalizedStatus || note.status === normalizedStatus || hasRecordedRepair(result, 'clinical_notes', note.id)) {
      continue;
    }

    const encounterState = validateEncounterLifecycle({
      patient_id: note.patient_id,
      phase: note.encounter_phase,
      is_discharged: note.is_discharged
    });

    if (!note.linked_encounter_id || !note.linked_patient_record_id || !encounterState.valid) {
      continue;
    }

    await recordRepair(result, context, {
      table: 'clinical_notes',
      id: note.id,
      updates: { status: normalizedStatus },
      reason: 'legacy_status_normalization'
    });
  }

  for (const prescription of scan.snapshots.prescriptions) {
    const normalizedStatus = normalizePrescriptionStatus(prescription.status);
    if (!normalizedStatus || prescription.status === normalizedStatus || hasRecordedRepair(result, 'prescriptions', prescription.id)) {
      continue;
    }

    const encounterState = validateEncounterLifecycle({
      patient_id: prescription.patient_id,
      phase: prescription.encounter_phase,
      is_discharged: prescription.is_discharged
    });

    if (!prescription.linked_encounter_id || !prescription.linked_patient_record_id || !encounterState.valid) {
      continue;
    }

    await recordRepair(result, context, {
      table: 'prescriptions',
      id: prescription.id,
      updates: { status: normalizedStatus },
      reason: 'legacy_status_normalization'
    });
  }
}

async function repairData(context, options = {}) {
  const result = createResult(options.dryRun !== false);
  result.before = await scanDataIntegrity(context);

  await repairPatients(result, context, result.before);
  await repairEncounters(result, context, result.before);

  const postEncounterScan = await scanDataIntegrity(context);
  await repairNotesAndPrescriptions(result, context, postEncounterScan);

  result.after = await scanDataIntegrity(context);
  return result;
}

function formatIntegrityReport(report) {
  const lines = [];
  const phaseLabel = report.dryRun ? 'DRY RUN' : 'APPLY';

  lines.push(`[DATA-INTEGRITY] Mode: ${phaseLabel}`);
  lines.push(
    `[DATA-INTEGRITY] Before: patients=${report.before.counts.invalidPatients}, encounters=${report.before.counts.invalidEncounters}, queue=${report.before.counts.malformedQueueRows}, notes=${report.before.counts.invalidNotes}, prescriptions=${report.before.counts.invalidPrescriptions}, legacy=${report.before.counts.legacyShapeMismatches}`
  );
  lines.push(
    `[DATA-INTEGRITY] Actions: repaired=${report.repaired.length}, quarantined=${report.quarantined.length}, manual_review=${report.manualReview.length}`
  );
  lines.push(
    `[DATA-INTEGRITY] After: patients=${report.after.counts.invalidPatients}, encounters=${report.after.counts.invalidEncounters}, queue=${report.after.counts.malformedQueueRows}, notes=${report.after.counts.invalidNotes}, prescriptions=${report.after.counts.invalidPrescriptions}, legacy=${report.after.counts.legacyShapeMismatches}`
  );

  for (const repair of report.repaired) {
    lines.push(`[REPAIRED] ${repair.table}:${repair.id} ${JSON.stringify(repair.updates)}`);
  }

  for (const quarantine of report.quarantined) {
    lines.push(`[QUARANTINED] ${quarantine.table}:${quarantine.id} reason=${quarantine.reason}`);
  }

  for (const manual of report.manualReview) {
    lines.push(`[MANUAL_REVIEW] ${manual.table}:${manual.id} reason=${manual.reason} ${manual.details || ''}`.trim());
  }

  return lines.join('\n');
}

module.exports = {
  scanDataIntegrity,
  repairData,
  formatIntegrityReport
};
