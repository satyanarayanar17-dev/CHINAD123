import { api } from './client';

export const clinicalApi = {
  /**
   * GET /notes/:noteId — Load note data from backend
   */
  getNote: async (noteId: string): Promise<any> => {
    const response = await api.get(`/notes/${noteId}`);
    return response.data;
  },

  /**
   * POST /notes — Create a new note draft for patient
   */
  createNote: async (patientId: string, draft_content?: string): Promise<{ noteId: string, newVersion: number }> => {
    const response = await api.post(`/notes`, { patientId, draft_content });
    return response.data;
  },

  /**
   * PUT /notes/:noteId — Save draft note content with OCC
   */
  saveDraftNote: async (noteId: string, draft_content: string, version: number): Promise<{ newVersion: number }> => {
    const response = await api.put(`/notes/${noteId}`, { draft_content, version });
    return response.data;
  },

  /**
   * POST /notes/:noteId/finalize — Finalize (sign) a clinical note.
   * Requires noteId and OCC version. Backend guards state + version.
   */
  finalizeNote: async (noteId: string, version: number): Promise<{ message: string }> => {
    const response = await api.post(`/notes/${noteId}/finalize`, { version });
    return response.data;
  },

  /**
   * GET /prescriptions/:rxId — Load prescription data from backend
   */
  getPrescription: async (rxId: string): Promise<any> => {
    const response = await api.get(`/prescriptions/${rxId}`);
    return response.data;
  },

  /**
   * POST /prescriptions/:rxId/handover — operational nurse/admin handover acknowledgement.
   */
  markPrescriptionHandedOver: async (rxId: string, dispensing_note?: string): Promise<{ message: string; handed_over_by: string; dispensing_note?: string | null }> => {
    const response = await api.post(`/prescriptions/${rxId}/handover`, { dispensing_note });
    return response.data;
  },

  /**
   * POST /prescriptions — Create a new prescription draft for patient
   */
  createPrescription: async (patientId: string, rx_content?: string): Promise<{ rxId: string, newVersion: number }> => {
    const response = await api.post(`/prescriptions`, { patientId, rx_content });
    return response.data;
  },

  /**
   * PUT /prescriptions/:rxId — Save draft prescription with OCC
   */
  saveDraftPrescription: async (rxId: string, rx_content: string, version: number): Promise<{ newVersion: number }> => {
    const response = await api.put(`/prescriptions/${rxId}`, { rx_content, version });
    return response.data;
  },

  /**
   * POST /prescriptions/:rxId/authorize — Authorize a prescription.
   * Requires rxId and OCC version. Backend binds authorizing doctor.
   */
  authorizePrescription: async (rxId: string, version: number): Promise<{ message: string }> => {
    const response = await api.post(`/prescriptions/${rxId}/authorize`, { version });
    return response.data;
  },

  /**
   * PATCH /encounters/:encounterId/discharge — Real discharge workflow.
   * Backend guards: unfinalized notes and unauthorized prescriptions block discharge.
   */
  dischargeEncounter: async (encounterId: string): Promise<{ message: string; phase: string }> => {
    const response = await api.patch(`/encounters/${encounterId}/discharge`);
    return response.data;
  },

  /**
   * POST /encounters/:encounterId/break-glass — Emergency access alert.
   * Creates immutable audit event, notifies admin. Does not bypass role enforcement.
   * Finalized records remain visible via the patient dossier for any doctor/nurse.
   * For active case transfer, admin must reassign via /admin/encounters/:id/reassign.
   */
  breakGlass: async (encounterId: string, justification: string): Promise<{ acknowledged: boolean; message: string }> => {
    const response = await api.post(`/encounters/${encounterId}/break-glass`, { justification });
    return response.data;
  }
};
