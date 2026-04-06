import { api } from './client';
import type { PatientAppointment, Prescription, LabReport } from '../store/mockData';

/**
 * Service layer for the Patient Portal.
 * All endpoints hit real backend routes — no mock fallbacks.
 */
export const PatientPortalAPI = {
  /**
   * GET /my/appointments — real backend data scoped to logged-in patient.
   */
  fetchMyAppointments: async (): Promise<PatientAppointment[]> => {
    const response = await api.get<PatientAppointment[]>('/my/appointments');
    return response.data;
  },

  /**
   * GET /my/prescriptions — real backend data.
   */
  fetchMyPrescriptions: async (): Promise<Prescription[]> => {
    const response = await api.get<Prescription[]>('/my/prescriptions');
    return response.data;
  },

  /**
   * GET /my/records — real backend data.
   */
  fetchMyRecords: async (): Promise<LabReport[]> => {
    const response = await api.get<LabReport[]>('/my/records');
    return response.data;
  }
};
