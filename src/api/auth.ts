import { api } from './client';
import type { AccountType, Role } from '../auth/roleBoundary';

export interface LoginPayload {
  username: string;
  password: string;
  accountType: Exclude<AccountType, null>;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: Role;
  account_type: AccountType;
  userId: string;
  name?: string;
  must_change_password: boolean;
}

export interface SessionResponse {
  id: string;
  role: Role;
  account_type: AccountType;
  name: string;
  must_change_password: boolean;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

type CredentialPayload = Omit<LoginPayload, 'accountType'>;

export const authApi = {
  loginPatient: async (payload: CredentialPayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login/patient', payload);
    return response.data;
  },

  loginStaff: async (payload: CredentialPayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login/staff', payload);
    return response.data;
  },

  login: async (payload: LoginPayload): Promise<AuthResponse> => (
    payload.accountType === 'patient'
      ? authApi.loginPatient(payload)
      : authApi.loginStaff(payload)
  ),

  me: async (): Promise<SessionResponse> => {
    const response = await api.get<SessionResponse>('/auth/me');
    return response.data;
  },

  refresh: async (): Promise<Pick<AuthResponse, 'access_token' | 'token_type' | 'role' | 'account_type'>> => {
    const response = await api.post<Pick<AuthResponse, 'access_token' | 'token_type' | 'role' | 'account_type'>>('/auth/refresh', {});
    return response.data;
  },

  changePassword: async (payload: ChangePasswordPayload): Promise<{ success: boolean; must_change_password: boolean }> => {
    const response = await api.post<{ success: boolean; must_change_password: boolean }>('/auth/change-password', payload);
    return response.data;
  },

  getSseToken: async (): Promise<string> => {
    const response = await api.get<{ token: string }>('/auth/sse-token');
    return response.data.token;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout', {});
  }
};
