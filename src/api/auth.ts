import { api } from './client';

export type Role = 'doctor' | 'patient' | 'nurse' | 'admin' | null;

export interface LoginPayload {
  username: string; // Used for ID
  password: string; // Used for PIN
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
}

export const authApi = {
  /**
   * login complies with FastAPI OAuth2PasswordRequestForm standard.
   * Expects x-www-form-urlencoded payload of username and password.
   */
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', payload.username);
    formData.append('password', payload.password);

    try {
      const response = await api.post<AuthResponse>('/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      return response.data;
    } catch (e) {
      throw e;
    }
  },

  /**
   * me is a GET endpoint strictly used to validate token & restore session
   */
  me: async (): Promise<SessionResponse> => {
    try {
      const response = await api.get<SessionResponse>('/auth/me');
      return response.data;
    } catch (e) {
      throw e;
    }
  }
};
