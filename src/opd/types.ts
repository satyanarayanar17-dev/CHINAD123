export type Role = "PATIENT" | "ADMIN" | "NURSE" | "DOCTOR";
export type Language = "en" | "ta" | "te";
export type QueueStatus =
  | "WAITING"
  | "TRIAGE"
  | "WAITING_DOCTOR"
  | "DOCTOR_READY"
  | "CONSULTATION"
  | "COMPLETED";
export interface Patient {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  dob: string;
  gender: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin_code: string;
  emergency_contact: string;
  preferred_language: Language;
  existing_mrn: string;
  allergies: string;
  __v: number;
}
export interface Staff {
  id: string;
  name: string;
  role: Role;
  department: string;
  is_active: number;
  must_change_password: number;
}
export interface Session {
  id: string;
  name: string;
  role: Role;
  department: string;
  patient_id: string | null;
  must_change_password: boolean;
}
export interface Department {
  id: string;
  name: string;
  prefix: string;
}
export interface Schedule {
  id: string;
  doctor_id: string;
  department_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  room: string;
  break_start: string | null;
  break_end: string | null;
  __v: number;
}
export interface Doctor extends Staff {
  schedules: Schedule[];
}
export interface Slot {
  scheduled_at: string;
  ends_at: string;
  room: string;
  department_id: string;
}
export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  department_id: string;
  scheduled_at: string;
  ends_at: string;
  room: string;
  status: "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  reason: string;
  encounter_id: string | null;
  follow_up_of: string | null;
  created_at: string;
  __v: number;
  patient_name: string;
  mrn: string;
  dob: string;
  gender: string;
  doctor_name: string;
  department_name: string;
  token?: string;
  queue_status?: QueueStatus;
}
export interface QueueEntry {
  encounter_id: string;
  appointment_id: string;
  department_id: string;
  token: string;
  date: string;
  status: QueueStatus;
  priority: number;
  checked_in_at: string;
  checked_in_by: string;
  triage_started_at: string | null;
  consultation_started_at: string | null;
  __v: number;
  patient_id: string;
  patient_name: string;
  mrn: string;
  dob: string;
  gender: string;
  doctor_id: string;
  doctor_name: string;
  department_name: string;
  room: string;
  scheduled_at: string;
  chief_complaint: string;
  patients_ahead: number;
  estimated_wait: number;
  wait_minutes: number;
}
export interface TriageData {
  temperature: number;
  systolic: number;
  diastolic: number;
  pulse: number;
  spo2: number;
  weight: number;
  height: number;
  glucose?: number | null;
  complaint: string;
  allergies: string;
  pain: number;
  notes: string;
  priority: number;
  bmi?: number;
}
export interface TriageRecord {
  id: string;
  encounter_id: string;
  version: number;
  data: TriageData;
  nurse_id: string;
  nurse_name: string;
  created_at: string;
  amendment_reason: string | null;
}
export interface Drug {
  id: string;
  name: string;
  strength: string;
  form: string;
  route: string;
}
export interface Diagnosis {
  id: string;
  name: string;
}
export interface Medication {
  drug_id: string;
  name?: string;
  strength?: string;
  form?: string;
  route?: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}
export interface ConsultationData {
  complaint: string;
  history: string;
  previous_history: string;
  examination: string;
  assessment: string;
  diagnosis_ids: string[];
  diagnoses?: Diagnosis[];
  treatment: string;
  advice: string;
  medications: Medication[];
  follow_up?: {
    doctor_id: string;
    scheduled_at: string;
    reason: string;
  } | null;
}
export interface Note {
  id: string;
  encounter_id: string;
  draft_content: ConsultationData;
  status: "DRAFT" | "FINALIZED";
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  __v: number;
}
export interface Prescription {
  id: string;
  encounter_id: string;
  rx_content: {
    medications: Medication[];
    diagnoses: Diagnosis[];
    advice: string;
    follow_up: unknown;
    validation: { issued_at: string; signed_by: string; sha256: string };
  };
  status: string;
  authorizing_user_id: string;
  doctor_name: string;
  created_at: string;
  __v: number;
}
export interface LabTest {
  id: string;
  name: string;
  code: string;
  department: string;
  unit: string;
  reference_range: string;
}
export interface LabResult {
  id: string;
  order_id: string;
  version: number;
  value: string;
  unit: string;
  reference_range: string;
  flag: "NORMAL" | "HIGH" | "LOW" | "CRITICAL";
  entered_by: string;
  entered_name: string;
  verified_by: string;
  verified_name: string;
  resulted_at: string;
  released: number;
  reason: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export interface LabOrder {
  id: string;
  encounter_id: string;
  test_id: string;
  ordered_by: string;
  ordered_at: string;
  status: "ORDERED" | "COLLECTED" | "PROCESSING" | "AVAILABLE" | "REVIEWED";
  __v: number;
  patient_name: string;
  patient_id: string;
  name: string;
  code: string;
  unit: string;
  reference_range: string;
  result: LabResult | null;
}
export interface JourneyEvent {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  appointment_id: string | null;
  code: string;
  actor_id: string;
  actor_name: string;
  occurred_at: string;
  context: Record<string, string | number>;
}
export interface Encounter {
  id: string;
  patient_id: string;
  assigned_doctor_id: string;
  phase: string;
  is_discharged: number;
  created_at: string;
  completed_at: string | null;
  __v: number;
  doctor_name: string;
  queue_status?: QueueStatus;
}
export interface RecordBundle {
  patient: Patient;
  encounters: Encounter[];
  triage: TriageRecord[];
  notes: Note[];
  prescriptions: Prescription[];
  labs: LabOrder[];
  journey: JourneyEvent[];
  versions: {
    id: string;
    resource_type: string;
    resource_id: string;
    version: number;
    actor_id: string;
    reason: string;
    created_at: string;
    data: unknown;
  }[];
}
export interface Notification {
  id: string;
  code: string;
  context: Record<string, string | number>;
  created_at: string;
  read_at: string | null;
}
export interface Dashboard {
  requires_action?: number;
  security_alerts?: number;
  today_confirmed?: number;
  upcoming?: number;
  date: string;
  appointments: number;
  checked_in: number;
  waiting: number;
  triage: number;
  consultation: number;
  completed: number;
  no_shows: number;
  average_wait: number | null;
  departments: {
    name: string;
    patients: number;
    waiting: number;
    average_wait: number | null;
    longest_wait: number | null;
  }[];
  doctors: {
    name: string;
    appointments: number;
    waiting: number;
    completed: number;
    average_consultation: number | null;
  }[];
  results_pending: number;
}
