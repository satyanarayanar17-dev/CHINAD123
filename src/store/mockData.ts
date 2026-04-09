// Centralized mock data store
// Single source of truth until FastAPI backend integration.

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  initials: string;
  age: number;
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
  __v?: number;
}

export interface TimelineEntry {
  id: string;
  patientId: string;
  date: string;
  type: 'consultation' | 'lab' | 'radiology';
  title: string;
  summary: string;
  verifiedBy: string;
}

// ── Phase 2: Patient-facing types ────────────────────────────────────────────

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
}

export interface LabReport {
  id: string;
  date: string;
  testName: string;
  status: 'READY' | 'PROCESSING';
  category: 'lab' | 'scan';
  findings?: string;
  requestedBy: string;
}

// ─── Clinical Staff — Patients ────────────────────────────────────────────────

export const MOCK_PATIENTS: Record<string, Patient> = {
  'CC-99821': {
    id: 'CC-99821',
    mrn: 'CC-99821-2024',
    name: 'Ramesh Sivakumar',
    initials: 'RS',
    age: 42,
    gender: 'Male',
    bloodGroup: 'O Negative',
    riskFlags: ['Diabetic (Type II)', 'Hypertensive'],
    allergies: [{ substance: 'PENICILLIN', severity: 'ANAPHYLAXIS', verifiedDate: 'Jan 12, 2023' }],
    vitals: { bp: '128/84', hr: 72, temp: 37.2, spo2: 98 },
    activeMeds: [
      { name: 'Metformin 500mg', dose: '500mg', frequency: 'Twice daily, post-meals' },
      { name: 'Aspirin 75mg', dose: '75mg', frequency: 'Once daily' },
    ],
  },
  'CC-8842': {
    id: 'CC-8842',
    mrn: 'CC-8842-2024',
    name: 'Arjun Singhania',
    initials: 'AS',
    age: 35,
    gender: 'Male',
    bloodGroup: 'B Positive',
    riskFlags: [],
    allergies: [],
    vitals: { bp: '118/76', hr: 80, temp: 36.8, spo2: 99 },
    activeMeds: [],
  },
  'CC-9021': {
    id: 'CC-9021',
    mrn: 'CC-9021-2024',
    name: 'Meera Krishnamurthy',
    initials: 'MK',
    age: 58,
    gender: 'Female',
    bloodGroup: 'A Positive',
    riskFlags: ['Cardiac Risk', 'Hypertensive'],
    allergies: [{ substance: 'ASPIRIN', severity: 'MODERATE', verifiedDate: 'Mar 3, 2022' }],
    vitals: { bp: '148/92', hr: 95, temp: 37.5, spo2: 96 },
    activeMeds: [{ name: 'Amlodipine 5mg', dose: '5mg', frequency: 'Once daily' }],
  },
};

// ─── Clinical Staff — Appointment Queue ──────────────────────────────────────

export const MOCK_QUEUE: AppointmentSlot[] = [
  {
    id: 'mock-enc-1',
    time: '09:15', status: 'DELAYED',
    patient: MOCK_PATIENTS['CC-8842'],
    type: 'Routine Follow-up', specialty: 'Cardiology',
    lifecycleStatus: 'RECEPTION',
  },
  {
    id: 'mock-enc-2',
    time: '09:45', status: 'ON_TIME',
    patient: MOCK_PATIENTS['CC-99821'],
    type: 'Post-Op Evaluation', specialty: 'General Medicine',
    lifecycleStatus: 'IN_CONSULTATION',
  },
  {
    id: 'mock-enc-3',
    time: '10:30', status: 'EARLY',
    patient: MOCK_PATIENTS['CC-9021'],
    type: 'Cardiology Review', specialty: 'Cardiology',
    lifecycleStatus: 'AWAITING',
  },
];

// ─── Clinical Timeline ────────────────────────────────────────────────────────

export const MOCK_TIMELINE: TimelineEntry[] = [
  {
    id: 'tl-001', patientId: 'CC-99821',
    date: 'Oct 24, 2024, 10:45 AM', type: 'consultation',
    title: 'Post-Op Cardiology Assessment',
    summary: 'Patient presents with mild discomfort in the mid-sternal region. Normal sinus rhythm on ECG. BP consistent with home monitoring. Prescribed lifestyle adjustments and continuation of current meds.',
    verifiedBy: 'Dr. Vikram Seth',
  },
  {
    id: 'tl-002', patientId: 'CC-99821',
    date: 'Oct 22, 2024, 09:12 AM', type: 'lab',
    title: 'Pathology — HbA1c & Lipid Panel',
    summary: 'HbA1c: 7.8% (High). LDL: 112 mg/dL (Normal). Requires dietary counselling.',
    verifiedBy: 'Dr. Meera Vasu',
  },
  {
    id: 'tl-003', patientId: 'CC-8842',
    date: 'Oct 20, 2024, 02:30 PM', type: 'radiology',
    title: 'MRI Knee — Left',
    summary: 'Mild meniscus irritation identified. No ligament tear. Conservative management advised.',
    verifiedBy: 'Dr. Suresh Nair',
  },
];

// ─── Patient Portal mock data (for logged-in patient: CC-99821 / Ramesh) ─────

export const MOCK_MY_APPOINTMENTS: PatientAppointment[] = [
  {
    id: 'apt-001', date: 'Apr 10, 2026', time: '10:30 AM',
    doctor: 'Dr. Vikram Seth', specialty: 'General Medicine',
    status: 'UPCOMING', reason: 'Diabetes review & HbA1c follow-up',
    location: 'OPD Block B, Room 12',
  },
  {
    id: 'apt-002', date: 'May 2, 2026', time: '09:00 AM',
    doctor: 'Dr. Priya Mehta', specialty: 'Cardiology',
    status: 'UPCOMING', reason: 'Annual cardiac screening',
    location: 'Cardiology Wing, Room 4',
  },
  {
    id: 'apt-003', date: 'Oct 24, 2024', time: '10:45 AM',
    doctor: 'Dr. Vikram Seth', specialty: 'General Medicine',
    status: 'COMPLETED', reason: 'Post-Op Cardiology Assessment',
    location: 'OPD Block B, Room 12',
  },
  {
    id: 'apt-004', date: 'Oct 22, 2024', time: '09:00 AM',
    doctor: 'Dr. Meera Vasu', specialty: 'Pathology',
    status: 'COMPLETED', reason: 'HbA1c & Lipid Panel collection',
    location: 'Lab Services, Ground Floor',
  },
];

export const MOCK_MY_PRESCRIPTIONS: Prescription[] = [
  {
    id: 'rx-001', medicine: 'Metformin Hydrochloride', dose: '500mg',
    frequency: 'Twice daily — after breakfast & dinner',
    prescribedBy: 'Dr. Vikram Seth', refillDate: 'Apr 18, 2026',
    daysRemaining: 13, reminderEnabled: true,
  },
  {
    id: 'rx-002', medicine: 'Aspirin', dose: '75mg',
    frequency: 'Once daily — morning, with water',
    prescribedBy: 'Dr. Vikram Seth', refillDate: 'May 1, 2026',
    daysRemaining: 26, reminderEnabled: true,
  },
  {
    id: 'rx-003', medicine: 'Gliclazide MR', dose: '30mg',
    frequency: 'Once daily — with breakfast',
    prescribedBy: 'Dr. Vikram Seth', refillDate: 'Apr 28, 2026',
    daysRemaining: 23, reminderEnabled: false,
  },
];

export const MOCK_MY_RECORDS: LabReport[] = [
  {
    id: 'rpt-001', date: 'Oct 22, 2024', testName: 'HbA1c & Lipid Panel',
    status: 'READY', category: 'lab',
    findings: 'HbA1c: 7.8% (High). LDL: 112 mg/dL (Normal).',
    requestedBy: 'Dr. Vikram Seth',
  },
  {
    id: 'rpt-002', date: 'Oct 20, 2024', testName: 'Urine Albumin Creatinine Ratio',
    status: 'READY', category: 'lab',
    findings: 'ACR: 28 mg/g (Borderline). Recheck in 3 months.',
    requestedBy: 'Dr. Vikram Seth',
  },
  {
    id: 'rpt-003', date: 'Mar 28, 2026', testName: 'Chest X-Ray (PA View)',
    status: 'READY', category: 'scan',
    findings: 'No active consolidation. Cardiothoracic ratio normal.',
    requestedBy: 'Dr. Priya Mehta',
  },
  {
    id: 'rpt-004', date: 'Apr 2, 2026', testName: 'Fasting Blood Sugar',
    status: 'PROCESSING', category: 'lab',
    requestedBy: 'Dr. Vikram Seth',
  },
];
export interface Notification {
  id: string;
  type: 'critical' | 'lab' | 'appointment' | 'info';
  title: string;
  body: string;
  time: string;
  read: boolean;
  targetPatientId?: string;
}

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n-001', type: 'critical',
    title: '🔴 Critical Lab Value',
    body: 'Ramesh Sivakumar — Potassium 6.2 mEq/L (Critical High). Immediate review required.',
    time: '09:05 AM', read: false,
  },
  {
    id: 'n-002', type: 'lab',
    title: 'Lab Results Ready',
    body: 'Arjun Singhania — CBC and Lipid Panel results are now available.',
    time: '08:55 AM', read: false,
  },
  {
    id: 'n-003', type: 'appointment',
    title: 'Appointment Confirmed',
    body: 'Meera Krishnamurthy — 10:30 AM Cardiology Review slot confirmed.',
    time: '08:40 AM', read: true,
  },
  {
    id: 'n-004', type: 'info',
    title: 'Prescription Dispensed',
    body: 'Gliclazide 80mg for Ramesh Sivakumar has been dispensed at the pharmacy.',
    time: 'Yesterday', read: true,
  },
];
