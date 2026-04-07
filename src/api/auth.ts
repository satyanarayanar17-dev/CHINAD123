import { api } from './client';

export type Role = 'doctor' | 'patient' | 'nurse' | 'admin' | null;

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: Role;
  userId: string;
}

export interface SessionResponse {
  id: string;
  role: Role;
  name: string;
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', {
      username: payload.username,
      password: payload.password
    });
    return response.data;
  },

  me: async (): Promise<SessionResponse> => {
    const response = await api.get<SessionResponse>('/auth/me');
    return response.data;
  }
};