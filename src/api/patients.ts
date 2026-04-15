import { api } from './client';
import type { Patient, TimelineEntry } from '../types/clinical';
import { normalizePatient, normalizeTimelineEntry } from './contracts';

export interface PatientRegistrationPayload {
  name: string;
  phone?: string;
  id?: string;
  dob: string;
  gender: string;
  issueActivationToken?: boolean;
}

export interface PatientRegistrationResponse {
  patient: {
    id: string;
    name: string;
    mrn: string;
    phone?: string | null;
  };
  encounterId: string | null;
  patientCreated: boolean;
  encounterCreated: boolean;
}

export interface PatientUpdatePayload {
  name?: string;
  phone?: string | null;
  dob?: string;
  gender?: string;
}

/**
 * Patient data API — no mock fallbacks.
 * Backend failures propagate as errors for honest UI handling.
 */
export const PatientsAPI = {
  getPatient: async (patientId: string): Promise<Patient> => {
    const response = await api.get<Patient>(`/patients/${patientId}`);
    return normalizePatient(response.data);
  },
  
  searchPatients: async (query: string): Promise<Patient[]> => {
    const response = await api.get<Patient[]>('/patients', { params: { q: query } });
    return response.data.map((patient) => normalizePatient(patient));
  },

  createPatient: async (payload: PatientRegistrationPayload): Promise<PatientRegistrationResponse> => {
    const response = await api.post<PatientRegistrationResponse>('/patients', payload);
    return response.data;
  },

  updatePatient: async (patientId: string, payload: PatientUpdatePayload): Promise<{ patient: Patient; updated: boolean }> => {
    const response = await api.patch<{ patient: Patient; updated: boolean }>(`/patients/${patientId}`, payload);
    return {
      ...response.data,
      patient: normalizePatient(response.data.patient),
    };
  },

  getPatientTimeline: async (patientId: string): Promise<TimelineEntry[]> => {
    const response = await api.get<TimelineEntry[]>(`/patients/${patientId}/timeline`);
    return response.data.map((entry, index) => normalizeTimelineEntry(entry, index));
  },

  /**
   * POST /patients/:patientId/break-glass — Emergency access alert.
   * Creates immutable audit event, notifies admin. Does not bypass role enforcement.
   * Finalized records remain visible via the patient dossier for any doctor/nurse.
   * For active case transfer, admin must reassign via /admin/encounters/:id/reassign.
   */
  breakGlass: async (patientId: string, justification: string): Promise<{ acknowledged: boolean; message: string }> => {
    const response = await api.post(`/patients/${patientId}/break-glass`, { justification });
    return response.data;
  }
};
