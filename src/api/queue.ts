import { api } from './client';
import type { AppointmentSlot, AssignedDoctorSummary, TriageVitals } from '../types/clinical';
import { normalizeQueueSlot } from './contracts';

export class QueueConflictError extends Error {
  constructor(message: string = 'Queue state changed by another session. Optimistic update reversed.') {
    super(message);
    this.name = 'QueueConflictError';
  }
}

export const queueApi = {
  fetchQueue: async (): Promise<AppointmentSlot[]> => {
    const response = await api.get<AppointmentSlot[]>('/queue');
    return response.data
      .map((slot, index) => normalizeQueueSlot(slot, index))
      .filter((slot): slot is AppointmentSlot => Boolean(slot));
  },

  fetchDoctors: async (): Promise<AssignedDoctorSummary[]> => {
    const response = await api.get<Array<Record<string, unknown>>>('/queue/doctors');
    return response.data.map((doctor) => ({
      id: String(doctor.id || ''),
      name: String(doctor.name || doctor.id || ''),
      status: Number(doctor.is_active) === 0 ? 'INACTIVE' : 'ACTIVE',
      activeQueueCount: Number(doctor.active_queue_count || 0)
    }));
  },

  handoffToDoctor: async (payload: {
    patientId: string;
    doctorId: string;
    chiefComplaint: string;
    triagePriority: string;
    handoffNotes?: string;
    vitals: TriageVitals;
  }): Promise<{ message: string; encounterId: string; patientId: string; assignedDoctor: AssignedDoctorSummary }> => {
    const response = await api.post('/queue/handoff', payload);
    return {
      ...response.data,
      assignedDoctor: {
        id: response.data.assignedDoctor?.id,
        name: response.data.assignedDoctor?.name || response.data.assignedDoctor?.id,
        status: 'ACTIVE'
      }
    };
  },

  /**
   * PATCH /queue/:encounterId
   * Backend expects: { phase: string, version: number }
   * Backend validates OCC version and returns 409 on stale state.
   */
  patchQueueSlot: async (encounterId: string, phase: string, version: number): Promise<void> => {
    try {
      await api.patch(`/queue/${encounterId}`, { phase, version });
    } catch (error: any) {
      if (error.response?.status === 409) {
        throw new QueueConflictError();
      }
      throw error;
    }
  }
};
