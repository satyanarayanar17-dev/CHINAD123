import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth';
import type { Role, LoginPayload } from '../api/auth';
import { ServerCrash } from 'lucide-react';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'backend_unavailable' | 'error';

interface AuthContextType {
  role: Role;
  user: string | null;
  status: AuthStatus;
  login: (payload: LoginPayload) => Promise<Role>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(null);
  const [user, setUser] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');

  const bootstrap = useCallback(async () => {
    try {
      const token = localStorage.getItem('cc_token');
      if (token) {
        const session = await authApi.me();
        setRole(session.role);
        setUser(session.id);
        setStatus('authenticated');
      } else {
        setRole(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch (e: any) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_refresh_token');
      setRole(null);
      setUser(null);
      
      // Distinguish backend transport failures vs auth rejection
      if (!e.response || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') {
        setStatus('backend_unavailable');
      } else if (e.response?.status === 401) {
        setStatus('unauthenticated');
      } else {
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (payload: LoginPayload) => {
    const res = await authApi.login(payload);
    localStorage.setItem('cc_token', res.access_token);
    localStorage.setItem('cc_role', res.role || 'doctor');
    if (res.refresh_token) {
      localStorage.setItem('cc_refresh_token', res.refresh_token);
    }
    setRole(res.role);
    setUser(res.userId);
    setStatus('authenticated');
    return res.role;
  };

  const logout = () => {
    const refreshToken = localStorage.getItem('cc_refresh_token');
    if (refreshToken) {
      // Fire-and-forget: revoke server-side. Client state clears regardless.
      authApi.logout(refreshToken).catch(() => {});
    }
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_refresh_token');
    setRole(null);
    setUser(null);
    setStatus('unauthenticated');
  };

  // Explicit, confirmed backend transport failure guard
  if (status === 'backend_unavailable') {
    return (
      <div className="min-h-screen bg-surface-container flex flex-col items-center justify-center text-on-surface p-6">
        <div className="bg-error/10 p-6 rounded-full mb-6">
          <ServerCrash size={48} className="text-error" />
        </div>
        <h1 className="text-3xl font-black mb-2 tracking-tight">System Offline</h1>
        <p className="text-on-surface-variant max-w-sm text-center mb-8">
          The Chettinad Care network is currently unreachable. Please check your connection or contact IT support.
        </p>
        <button 
          onClick={bootstrap}
          className="bg-error text-white font-bold py-3 px-8 rounded-xl hover:brightness-110 transition-colors shadow-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ role, user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
