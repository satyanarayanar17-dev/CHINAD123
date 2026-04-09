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
  name?: string;
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
  },

  refresh: async (): Promise<Pick<AuthResponse, 'access_token' | 'token_type'>> => {
    const response = await api.post<Pick<AuthResponse, 'access_token' | 'token_type'>>('/auth/refresh', {});
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
