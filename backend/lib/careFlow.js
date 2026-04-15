const {
  normalizeIdentifier,
  validateEncounterLifecycle,
  validatePatientRecord
} = require('./clinicalIntegrity');

function buildIntegrityError(message, details = [], code = 'DATA_INTEGRITY_VIOLATION', status = 409) {
  return {
    status,
    code,
    message,
    details
  };
}

async function loadPatientRecord(context, patientId) {
  return context.get(
    `SELECT id, name, phone, dob, gender
     FROM patients
     WHERE id = ?`,
    [patientId]
  );
}

function assertPatientRecord(patientRow, options = {}) {
  if (!patientRow) {
    throw {
      status: 404,
      code: 'PATIENT_NOT_FOUND',
      message: 'Patient not found.'
    };
  }

  const patientState = validatePatientRecord(patientRow, {
    allowDeterministicNameFallback: false,
    allowDeterministicGenderFallback: false,
    ...options
  });

  if (!patientState.valid) {
    throw buildIntegrityError(
      'Patient demographics are malformed and must be repaired before continuing.',
      patientState.errors
    );
  }

  return patientRow;
}

async function listActiveEncountersForPatient(context, patientId) {
  const normalizedPatientId = normalizeIdentifier(patientId);
  if (!normalizedPatientId) {
    return [];
  }

  return context.all(
    `SELECT id, patient_id, phase, lifecycle_status, is_discharged, assigned_doctor_id, __v, created_at
     FROM encounters
     WHERE patient_id = ? AND is_discharged = 0
     ORDER BY created_at DESC, id DESC`,
    [normalizedPatientId]
  );
}

function assertEncounterRecord(encounter, options = {}) {
  const {
    allowDischarged = false,
    malformedMessage = 'Encounter is malformed and must be repaired before continuing.',
    missingMessage = 'Encounter missing.',
    missingCode = 'NOT_FOUND'
  } = options;

  if (!encounter) {
    throw {
      status: 404,
      code: missingCode,
      message: missingMessage
    };
  }

  const encounterState = validateEncounterLifecycle(encounter);
  if (!encounterState.valid) {
    throw buildIntegrityError(malformedMessage, encounterState.errors);
  }

  if (!allowDischarged && encounterState.isDischarged === 1) {
    throw {
      status: 422,
      code: 'ENCOUNTER_CLOSED',
      message: 'Encounter is already discharged.'
    };
  }

  return {
    ...encounter,
    phase: encounterState.phase,
    lifecycle_status: encounterState.lifecycleStatus
  };
}

function assertDoctorAssignment(encounter, doctorId, options = {}) {
  const { missingMessage = 'This encounter has not been assigned to a doctor yet.' } = options;
  const assignedDoctorId = normalizeIdentifier(encounter?.assigned_doctor_id);

  if (!assignedDoctorId) {
    throw {
      status: 403,
      code: 'ASSIGNED_DOCTOR_REQUIRED',
      message: missingMessage
    };
  }

  if (assignedDoctorId !== normalizeIdentifier(doctorId)) {
    throw {
      status: 403,
      code: 'ASSIGNED_DOCTOR_MISMATCH',
      message: 'This encounter is assigned to a different doctor.'
    };
  }

  return encounter;
}

async function resolveSingleActiveEncounter(context, patientId, options = {}) {
  const {
    required = true,
    duplicateMessage = 'Multiple active encounters exist for this patient. Repair the data before continuing.',
    missingMessage = 'No active encounter exists for this patient.',
    malformedMessage = 'Active encounter is malformed and must be repaired before continuing.'
  } = options;

  const activeEncounters = await listActiveEncountersForPatient(context, patientId);
  if (activeEncounters.length === 0) {
    if (!required) {
      return null;
    }

    throw {
      status: 422,
      code: 'NO_ACTIVE_ENCOUNTER',
      message: missingMessage
    };
  }

  if (activeEncounters.length > 1) {
    throw buildIntegrityError(
      duplicateMessage,
      activeEncounters.map((encounter) => encounter.id),
      'DUPLICATE_ACTIVE_ENCOUNTERS'
    );
  }

  return assertEncounterRecord(activeEncounters[0], {
    malformedMessage
  });
}

async function ensureActiveEncounter(context, patientId, options = {}) {
  const {
    encounterId,
    defaultPhase = 'RECEPTION'
  } = options;

  const existingEncounter = await resolveSingleActiveEncounter(context, patientId, {
    required: false
  });

  if (existingEncounter) {
    return {
      encounter: existingEncounter,
      created: false
    };
  }

  const newEncounter = {
    id: encounterId,
    patient_id: patientId,
    phase: defaultPhase,
    lifecycle_status: defaultPhase,
    is_discharged: 0,
    __v: 1
  };

  await context.run(
    `INSERT INTO encounters (id, patient_id, phase, lifecycle_status, is_discharged, __v)
     VALUES (?, ?, ?, ?, 0, 1)`,
    [newEncounter.id, newEncounter.patient_id, newEncounter.phase, newEncounter.lifecycle_status]
  );

  return {
    encounter: newEncounter,
    created: true
  };
}

module.exports = {
  buildIntegrityError,
  loadPatientRecord,
  assertPatientRecord,
  listActiveEncountersForPatient,
  assertEncounterRecord,
  assertDoctorAssignment,
  resolveSingleActiveEncounter,
  ensureActiveEncounter
};
