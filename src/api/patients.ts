import { api } from './client';
import type { Patient, TimelineEntry } from '../store/mockData';
import { normalizePatient, normalizeTimelineEntry } from './contracts';

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

  getPatientTimeline: async (patientId: string): Promise<TimelineEntry[]> => {
    const response = await api.get<TimelineEntry[]>(`/patients/${patientId}/timeline`);
    return response.data.map((entry, index) => normalizeTimelineEntry(entry, index));
  },

  breakGlass: async (patientId: string, justification: string): Promise<{ granted: boolean; message: string }> => {
    const response = await api.post(`/patients/${patientId}/break-glass`, { justification });
    return response.data;
  }
};
