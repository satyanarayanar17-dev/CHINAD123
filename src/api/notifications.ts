import { api } from './client';
import type { Notification } from '../store/mockData';

/**
 * Notifications API — hits real backend.
 * No mock fallbacks. Errors propagate honestly.
 */
export const notificationsApi = {
  fetchNotifications: async (): Promise<Notification[]> => {
    const response = await api.get<Notification[]>('/notifications');
    return response.data;
  },

  syncNotifications: async (notifications: Notification[]): Promise<void> => {
    await api.put('/notifications', notifications);
  }
};
