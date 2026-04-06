import { api } from './client';

export interface User {
  id: string;
  role: 'NURSE' | 'DOCTOR' | 'ADMIN';
  name: string;
  is_active: number;
}

export const adminApi = {
  getUsers: async (): Promise<User[]> => {
    const res = await api.get('/admin/users');
    return res.data;
  },

  createUser: async (payload: { id: string; role: string; name: string; password: string }) => {
    const res = await api.post('/admin/users', payload);
    return res.data;
  },

  disableUser: async (userId: string) => {
    const res = await api.patch(`/admin/users/${userId}/disable`);
    return res.data;
  },

  enableUser: async (userId: string) => {
    const res = await api.patch(`/admin/users/${userId}/enable`);
    return res.data;
  },

  resetPassword: async (userId: string, newPassword: string) => {
    const res = await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
    return res.data;
  }
};
