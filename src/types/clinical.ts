// Clinical domain types used by UI rendering and API contracts.

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
}

export interface Patient {
  id: string;
  mrn: string;
  phone?: string | null;
  name: string;
  initials: string;
  age: number;
  dob: string | null;
  gender: string;
  bloodGroup: string;
  riskFlags: string[];
  allergies: Array<{ substance: string; severity: string; verifiedDate: string }>;
  vitals: { bp: string; hr: number; temp: number; spo2: number };
  activeMeds: Medication[];
}

export interface AppointmentSlot {
  id: string;
  time: string;
  status: 'ON_TIME' | 'DELAYED' | 'EARLY';
  patient: Patient;
  type: string;
  specialty: string;
  lifecycleStatus: 'AWAITING' | 'RECEPTION' | 'IN_CONSULTATION' | 'DISCHARGED';
  encounterPhase?: string;
  __v?: number;
}

export interface TimelineEntry {
  id: string;
  patientId: string;
  date: string;
  occurredAt?: string;
  type: 'encounter' | 'consultation' | 'prescription' | 'discharge' | 'lab' | 'radiology';
  title: string;
  summary: string;
  verifiedBy: string;
  encounterId?: string | null;
  noteId?: string | null;
  rxId?: string | null;
}

export interface PatientAppointment {
  id: string;
  date: string;
  time: string;
  doctor: string;
  specialty: string;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  reason: string;
  location: string;
}

export interface Prescription {
  id: string;
  medicine: string;
  dose: string;
  frequency: string;
  prescribedBy: string;
  refillDate: string;
  daysRemaining: number;
  reminderEnabled: boolean;
  status?: string;
}

export interface LabReport {
  id: string;
  date: string;
  testName: string;
  status: 'READY' | 'PROCESSING';
  category: 'lab' | 'scan' | 'note';
  findings?: string;
  requestedBy: string;
}

export interface Notification {
  id: string;
  type: 'critical' | 'lab' | 'appointment' | 'info';
  title: string;
  body: string;
  time: string;
  read: boolean;
  targetPatientId?: string;
}
