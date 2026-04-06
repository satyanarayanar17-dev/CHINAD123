import { api } from './client';
import type { AppointmentSlot } from '../store/mockData';

export class QueueConflictError extends Error {
  constructor(message: string = 'Queue state changed by another session. Optimistic update reversed.') {
    super(message);
    this.name = 'QueueConflictError';
  }
}

export const queueApi = {
  fetchQueue: async (): Promise<AppointmentSlot[]> => {
    const response = await api.get<AppointmentSlot[]>('/queue');
    return response.data;
  },

  addQueueSlot: async (slot: AppointmentSlot): Promise<void> => {
    await api.post('/queue', slot);
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
