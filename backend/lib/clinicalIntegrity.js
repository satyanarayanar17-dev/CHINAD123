const PATIENT_GENDERS = ['Male', 'Female', 'Other', 'Not specified'];
const ACTIVE_ENCOUNTER_PHASES = ['AWAITING', 'RECEPTION', 'IN_CONSULTATION'];
const DISCHARGED_ENCOUNTER_PHASE = 'DISCHARGED';
const ALL_ENCOUNTER_PHASES = [...ACTIVE_ENCOUNTER_PHASES, DISCHARGED_ENCOUNTER_PHASE];
const LEGACY_ENCOUNTER_PHASE_ALIASES = {
  CLOSED: DISCHARGED_ENCOUNTER_PHASE
};
const NOTE_STATUSES = ['DRAFT', 'FINALIZED'];
const PRESCRIPTION_STATUSES = ['DRAFT', 'AUTHORIZED'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimToNull(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeIdentifier(value) {
  return trimToNull(value);
}

function normalizePatientGender(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return 'Not specified';
  }

  const match = PATIENT_GENDERS.find((gender) => gender.toLowerCase() === trimmed.toLowerCase());
  return match || null;
}

function isIsoDateOnly(value) {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

function calculateAge(dob) {
  if (!isIsoDateOnly(dob)) {
    return 0;
  }

  const birthDate = new Date(`${dob}T00:00:00.000Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDelta = now.getUTCDate() - birthDate.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function buildUnknownPatientName(patientId) {
  return patientId ? `Unknown Patient (${patientId})` : 'Unknown Patient';
}

function getPatientDisplayName(name, patientId) {
  return trimToNull(name) || buildUnknownPatientName(patientId);
}

function buildInitials(name) {
  const displayName = trimToNull(name) || 'Unknown Patient';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return initials || 'UP';
}

function buildPatientReadModel(row = {}) {
  const patientId = normalizeIdentifier(row.id || row.patient_id);
  if (!patientId) {
    return null;
  }

  const displayName = getPatientDisplayName(row.name || row.patient_name, patientId);
  const gender = normalizePatientGender(row.gender) || 'Not specified';
  const dob = isIsoDateOnly(row.dob) ? row.dob : null;

  return {
    id: patientId,
    name: displayName,
    mrn: patientId,
    age: calculateAge(dob),
    dob,
    gender,
    bloodGroup: 'Unknown',
    initials: buildInitials(displayName),
    riskFlags: [],
    allergies: [],
    vitals: { bp: '—', hr: 0, temp: 0, spo2: 0 },
    activeMeds: []
  };
}

function normalizeEncounterPhase(value, options = {}) {
  const { allowLegacyAlias = true } = options;
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  const candidate = allowLegacyAlias ? (LEGACY_ENCOUNTER_PHASE_ALIASES[upper] || upper) : upper;
  return ALL_ENCOUNTER_PHASES.includes(candidate) ? candidate : null;
}

function normalizeNoteStatus(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  return NOTE_STATUSES.includes(upper) ? upper : null;
}

function normalizePrescriptionStatus(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  return PRESCRIPTION_STATUSES.includes(upper) ? upper : null;
}

function toDischargeFlag(value) {
  return Number(value) === 1 ? 1 : 0;
}

function validateEncounterLifecycle(row = {}) {
  const patientId = normalizeIdentifier(row.patient_id);
  const phase = normalizeEncounterPhase(row.phase);
  const isDischarged = toDischargeFlag(row.is_discharged);
  const errors = [];

  if (!patientId) {
    errors.push('missing_patient_id');
  }

  if (!phase) {
    errors.push('invalid_phase');
  }

  if (phase === DISCHARGED_ENCOUNTER_PHASE && isDischarged !== 1) {
    errors.push('phase_requires_discharged_flag');
  }

  if (phase && phase !== DISCHARGED_ENCOUNTER_PHASE && isDischarged === 1) {
    errors.push('discharged_flag_requires_discharged_phase');
  }

  return {
    valid: errors.length === 0,
    patientId,
    phase,
    isDischarged,
    errors
  };
}

function normalizeQueueTransitionPhase(value) {
  const phase = normalizeEncounterPhase(value, { allowLegacyAlias: false });
  if (!phase || !ACTIVE_ENCOUNTER_PHASES.includes(phase)) {
    return null;
  }

  return phase;
}

function serializeQueueSlot(row = {}) {
  const encounterId = normalizeIdentifier(row.encounter_id || row.id);
  const patientRecordId = normalizeIdentifier(row.patient_record_id || row.linked_patient_record_id);
  const lifecycle = validateEncounterLifecycle(row);
  const patient = patientRecordId
    ? buildPatientReadModel({
        id: row.patient_id,
        name: row.name,
        dob: row.dob,
        gender: row.gender
      })
    : null;
  const warnings = [];
  const errors = [];

  if (!encounterId) {
    errors.push('missing_encounter_id');
  }

  if (!patientRecordId) {
    errors.push('missing_patient_record');
  }

  if (!patient) {
    errors.push('missing_patient_payload');
  } else if (!trimToNull(row.name)) {
    warnings.push('missing_patient_name_placeholder_applied');
  }

  if (!lifecycle.valid) {
    errors.push(...lifecycle.errors);
  }

  if (lifecycle.isDischarged === 1 || lifecycle.phase === DISCHARGED_ENCOUNTER_PHASE) {
    errors.push('discharged_encounter_cannot_appear_in_queue');
  }

  if (errors.length > 0) {
    return {
      slot: null,
      warnings,
      errors
    };
  }

  return {
    slot: {
      id: encounterId,
      time: '09:00',
      status: 'ON_TIME',
      patient,
      type: 'General Review',
      specialty: 'General Medicine',
      lifecycleStatus: lifecycle.phase,
      __v: Number.isInteger(row.__v) ? row.__v : Number(row.__v) || 1
    },
    warnings,
    errors: []
  };
}

function validatePatientRegistrationPayload(payload = {}) {
  const normalized = {
    id: normalizeIdentifier(payload.id),
    name: trimToNull(payload.name),
    dob: trimToNull(payload.dob),
    gender: normalizePatientGender(payload.gender),
    createEncounter: payload.createEncounter !== false
  };
  const errors = [];

  if (!normalized.id) {
    errors.push({ field: 'id', message: 'Patient UHID is required.' });
  }

  if (!normalized.name) {
    errors.push({ field: 'name', message: 'Patient name is required.' });
  }

  if (!normalized.dob || !isIsoDateOnly(normalized.dob)) {
    errors.push({ field: 'dob', message: 'Patient DOB must be a valid YYYY-MM-DD date.' });
  }

  if (!normalized.gender) {
    errors.push({
      field: 'gender',
      message: `Gender must be one of: ${PATIENT_GENDERS.join(', ')}.`
    });
  }

  return {
    valid: errors.length === 0,
    value: normalized,
    errors
  };
}

function describeQueueIntegrityIssue(row, reasons = []) {
  return {
    encounterId: normalizeIdentifier(row.encounter_id || row.id) || 'UNKNOWN_ENCOUNTER',
    patientId: normalizeIdentifier(row.patient_id) || 'UNKNOWN_PATIENT',
    reasons
  };
}

module.exports = {
  PATIENT_GENDERS,
  ACTIVE_ENCOUNTER_PHASES,
  DISCHARGED_ENCOUNTER_PHASE,
  ALL_ENCOUNTER_PHASES,
  NOTE_STATUSES,
  PRESCRIPTION_STATUSES,
  LEGACY_ENCOUNTER_PHASE_ALIASES,
  isIsoDateOnly,
  trimToNull,
  normalizeIdentifier,
  normalizePatientGender,
  getPatientDisplayName,
  buildUnknownPatientName,
  buildPatientReadModel,
  normalizeEncounterPhase,
  normalizeQueueTransitionPhase,
  normalizeNoteStatus,
  normalizePrescriptionStatus,
  validateEncounterLifecycle,
  validatePatientRegistrationPayload,
  serializeQueueSlot,
  describeQueueIntegrityIssue
};
