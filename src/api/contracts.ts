import type {
  AppointmentSlot,
  LabReport,
  Patient,
  PatientAppointment,
  Prescription,
  TimelineEntry,
} from '../store/mockData';

type UnknownRecord = Record<string, unknown>;

const QUEUE_STATUSES = new Set<AppointmentSlot['status']>(['ON_TIME', 'DELAYED', 'EARLY']);
const LIFECYCLE_STATUSES = new Set<AppointmentSlot['lifecycleStatus']>([
  'AWAITING',
  'RECEPTION',
  'IN_CONSULTATION',
  'DISCHARGED',
]);
const TIMELINE_TYPES = new Set<TimelineEntry['type']>([
  'encounter',
  'consultation',
  'prescription',
  'discharge',
  'lab',
  'radiology',
]);
const APPOINTMENT_STATUSES = new Set<PatientAppointment['status']>(['UPCOMING', 'COMPLETED', 'CANCELLED']);
const RECORD_STATUSES = new Set<LabReport['status']>(['READY', 'PROCESSING']);
const RECORD_CATEGORIES = new Set<LabReport['category']>(['lab', 'scan', 'note']);

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown, fallback = 1): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
}

function normalizePatientName(name: unknown, patientId: string): string {
  return asString(name) || `Unknown Patient (${patientId})`;
}

function buildInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return initials || 'UP';
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const raw = asString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: Date | null, fallback = 'Unavailable'): string {
  if (!date) {
    return fallback;
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(date: Date | null, fallback = 'Unavailable'): string {
  if (!date) {
    return fallback;
  }

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeTimelineType(value: unknown): TimelineEntry['type'] {
  const type = asString(value);
  if (type && TIMELINE_TYPES.has(type as TimelineEntry['type'])) {
    return type as TimelineEntry['type'];
  }

  return 'consultation';
}

export function normalizePatient(raw: unknown): Patient {
  const row = asRecord(raw);
  const id = asString(row.id) || asString(row.patientId) || 'unknown-patient';
  const name = normalizePatientName(row.name, id);

  return {
    id,
    mrn: asString(row.mrn) || id,
    name,
    initials: asString(row.initials) || buildInitials(name),
    age: Math.max(0, asNumber(row.age, 0)),
    dob: asString(row.dob),
    gender: asString(row.gender) || 'Not specified',
    bloodGroup: asString(row.bloodGroup) || 'Unknown',
    riskFlags: Array.isArray(row.riskFlags) ? row.riskFlags.filter((item): item is string => Boolean(asString(item))) : [],
    allergies: Array.isArray(row.allergies)
      ? row.allergies
          .map((item) => {
            const allergy = asRecord(item);
            const substance = asString(allergy.substance);
            if (!substance) {
              return null;
            }

            return {
              substance,
              severity: asString(allergy.severity) || 'Unspecified',
              verifiedDate: asString(allergy.verifiedDate) || 'Unverified',
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [],
    vitals: {
      bp: asString(asRecord(row.vitals).bp) || '—',
      hr: Math.max(0, asNumber(asRecord(row.vitals).hr, 0)),
      temp: Math.max(0, asNumber(asRecord(row.vitals).temp, 0)),
      spo2: Math.max(0, asNumber(asRecord(row.vitals).spo2, 0)),
    },
    activeMeds: Array.isArray(row.activeMeds)
      ? row.activeMeds
          .map((item) => {
            const medication = asRecord(item);
            const medName = asString(medication.name);
            if (!medName) {
              return null;
            }

            return {
              name: medName,
              dose: asString(medication.dose) || 'As prescribed',
              frequency: asString(medication.frequency) || 'Follow instructions',
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [],
  };
}

export function normalizeQueueSlot(raw: unknown, index = 0): AppointmentSlot | null {
  const row = asRecord(raw);
  const encounterId = asString(row.id) || asString(row.encounterId) || `queue-slot-${index}`;
  const patient = normalizePatient(row.patient);
  const rawStatus = asString(row.status);
  const rawLifecycle = asString(row.lifecycleStatus);

  if (!encounterId || !patient.id) {
    return null;
  }

  return {
    id: encounterId,
    time: asString(row.time) || 'TBD',
    status: QUEUE_STATUSES.has(rawStatus as AppointmentSlot['status'])
      ? (rawStatus as AppointmentSlot['status'])
      : 'ON_TIME',
    patient,
    type: asString(row.type) || 'General Review',
    specialty: asString(row.specialty) || 'General Medicine',
    lifecycleStatus: LIFECYCLE_STATUSES.has(rawLifecycle as AppointmentSlot['lifecycleStatus'])
      ? (rawLifecycle as AppointmentSlot['lifecycleStatus'])
      : 'AWAITING',
    encounterPhase: asString(row.encounterPhase) || undefined,
    __v: asInteger(row.__v, 1),
  };
}

export function normalizeTimelineEntry(raw: unknown, index = 0): TimelineEntry {
  const row = asRecord(raw);
  const id = asString(row.id) || `timeline-entry-${index}`;
  const dateValue = toDate(row.occurredAt) || toDate(row.date);
  const patientId = asString(row.patientId) || asString(row.patient_id) || 'unknown-patient';
  const type = normalizeTimelineType(row.type);

  return {
    id,
    patientId,
    date: formatDate(dateValue),
    occurredAt: (dateValue || new Date()).toISOString(),
    type,
    title: asString(row.title) || 'Care activity',
    summary: asString(row.summary) || 'No clinical summary provided.',
    verifiedBy: asString(row.verifiedBy) || 'System',
    encounterId: asString(row.encounterId),
    noteId: asString(row.noteId),
    rxId: asString(row.rxId),
  };
}

export function normalizePatientAppointment(raw: unknown, index = 0): PatientAppointment {
  const row = asRecord(raw);
  const dateValue = toDate(row.scheduledAt) || toDate(row.date);
  const rawStatus = asString(row.status);

  return {
    id: asString(row.id) || `appointment-${index}`,
    date: asString(row.date) || formatDate(dateValue),
    time: asString(row.time) || formatTime(dateValue),
    doctor: asString(row.doctor) || 'Assigned Care Team',
    specialty: asString(row.specialty) || 'General Medicine',
    status: APPOINTMENT_STATUSES.has(rawStatus as PatientAppointment['status'])
      ? (rawStatus as PatientAppointment['status'])
      : 'UPCOMING',
    reason: asString(row.reason) || 'Follow-up visit',
    location: asString(row.location) || 'Chettinad Care OPD',
  };
}

export function normalizePrescription(raw: unknown, index = 0): Prescription {
  const row = asRecord(raw);
  const daysRemaining = Math.max(0, asNumber(row.daysRemaining, 0));

  return {
    id: asString(row.id) || `prescription-${index}`,
    medicine: asString(row.medicine) || 'Medication on file',
    dose: asString(row.dose) || 'As prescribed',
    frequency: asString(row.frequency) || 'Follow care team instructions',
    prescribedBy: asString(row.prescribedBy) || 'Authorized physician',
    refillDate: asString(row.refillDate) || 'Check with care team',
    daysRemaining,
    reminderEnabled: typeof row.reminderEnabled === 'boolean' ? row.reminderEnabled : false,
    status: asString(row.status) || 'AUTHORIZED',
  };
}

export function normalizeLabReport(raw: unknown, index = 0): LabReport {
  const row = asRecord(raw);
  const rawStatus = asString(row.status);
  const rawCategory = asString(row.category);

  return {
    id: asString(row.id) || `record-${index}`,
    date: asString(row.date) || formatDate(toDate(row.created_at)),
    testName: asString(row.testName) || 'Clinical record',
    status: RECORD_STATUSES.has(rawStatus as LabReport['status'])
      ? (rawStatus as LabReport['status'])
      : 'READY',
    category: RECORD_CATEGORIES.has(rawCategory as LabReport['category'])
      ? (rawCategory as LabReport['category'])
      : 'note',
    findings: asString(row.findings) || undefined,
    requestedBy: asString(row.requestedBy) || 'Attending Physician',
  };
}

export function getDateBadgeParts(dateLabel: string) {
  const parsed = toDate(dateLabel);
  if (!parsed) {
    return { month: '—', day: '—', year: '—' };
  }

  return {
    month: parsed.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
    day: parsed.toLocaleDateString('en-IN', { day: '2-digit' }),
    year: parsed.toLocaleDateString('en-IN', { year: 'numeric' }),
  };
}
