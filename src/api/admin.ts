import { api } from './client';

export interface User {
  id: string;
  role: 'NURSE' | 'DOCTOR' | 'ADMIN';
  name: string;
  is_active: number;
}

export interface PatientRegistrationPayload {
  name: string;
  phone: string;
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
  activation?: ActivationResponse | null;
  activationPath?: string | null;
}

export interface ActivationResponse {
  message: string;
  activation_code?: string;
  expires_at?: string;
  delivery_mode?: string;
}

export interface ResetPasswordResponse {
  userId: string;
  reset: boolean;
  temporaryPassword: string;
  must_change_password: boolean;
  message: string;
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

  resetPassword: async (userId: string): Promise<ResetPasswordResponse> => {
    const res = await api.post<ResetPasswordResponse>(`/admin/users/${userId}/reset-password`, {});
    return res.data;
  },

  createPatient: async (payload: PatientRegistrationPayload): Promise<PatientRegistrationResponse> => {
    const res = await api.post('/patients', payload);
    return res.data;
  }
};
