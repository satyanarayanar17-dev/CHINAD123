import type { TriageVitals } from '../types/clinical';

export const TRIAGE_PRIORITY_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'LOW', label: 'Low' },
] as const;

export interface NurseIdentityInput {
  name: string;
  dob: string;
  gender: string;
  phone?: string;
}

export interface NurseTriageSubmitInput {
  patientId?: string;
  doctorId?: string;
  chiefComplaint: string;
  triagePriority: string;
  doctorsAvailable: number;
}

export function buildSuggestedTriagePriority(ewsScore: number) {
  if (ewsScore >= 6) return 'IMMEDIATE';
  if (ewsScore >= 3) return 'URGENT';
  if (ewsScore >= 1) return 'STANDARD';
  return 'LOW';
}

export function isValidPhoneNumber(phone?: string) {
  if (!phone || phone.trim().length === 0) {
    return true;
  }

  const digits = phone.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function validateIdentity(input: NurseIdentityInput) {
  const errors: Partial<Record<keyof NurseIdentityInput, string>> = {};

  if (!input.name.trim()) {
    errors.name = 'Patient name is required.';
  }

  if (!input.dob) {
    errors.dob = 'DOB is required.';
  } else if (Number.isNaN(new Date(`${input.dob}T00:00:00.000Z`).getTime())) {
    errors.dob = 'DOB must be a valid date.';
  }

  if (!input.gender.trim()) {
    errors.gender = 'Sex / gender is required.';
  }

  if (!isValidPhoneNumber(input.phone)) {
    errors.phone = 'Phone must be a valid mobile number if entered.';
  }

  return errors;
}

export function validateTriageSubmission(input: NurseTriageSubmitInput) {
  const errors: Record<string, string> = {};

  if (!input.patientId) {
    errors.patient = 'Select or create a patient before pushing to doctor.';
  }

  if (input.doctorsAvailable === 0) {
    errors.doctor = 'No doctors are currently available for assignment.';
  } else if (!input.doctorId) {
    errors.doctor = 'Doctor selection is required before handoff.';
  }

  if (!input.chiefComplaint.trim()) {
    errors.chiefComplaint = 'Chief complaint is required.';
  }

  if (!TRIAGE_PRIORITY_OPTIONS.some((option) => option.value === input.triagePriority)) {
    errors.triagePriority = 'Choose a valid triage priority.';
  }

  return errors;
}

export function buildEmptyVitals(): TriageVitals {
  return {
    height: 175,
    weight: 70,
    systolic: 120,
    diastolic: 80,
    hr: 72,
    temp: 37,
    spo2: 99,
  };
}
