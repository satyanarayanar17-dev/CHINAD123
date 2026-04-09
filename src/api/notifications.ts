import { api } from './client';
import type { Notification } from '../store/mockData';

/**
 * Notifications API — DB-backed as of Phase 2.
 * Notifications now persist across server restarts.
 */
export const notificationsApi = {
  fetchNotifications: async (): Promise<Notification[]> => {
    const response = await api.get<Notification[]>('/notifications');
    return response.data;
  },

  /**
   * Mark a single notification as read by its DB id.
   */
  markRead: async (id: string): Promise<void> => {
    await api.patch(`/notifications/${id}/read`);
  },

  /**
   * Mark all visible notifications as read.
   */
  markAllRead: async (): Promise<void> => {
    await api.post('/notifications/read-all');
  },

  /**
   * Legacy batch sync — kept for backward compatibility.
   */
  syncNotifications: async (notifications: Notification[]): Promise<void> => {
    await api.put('/notifications', notifications);
  }
};
