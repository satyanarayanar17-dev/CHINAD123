import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth';
import type { LoginPayload } from '../api/auth';
import { clearAccessToken, setAccessToken } from '../api/client';
import { ServerCrash } from 'lucide-react';
import type { AccountType, Role } from '../auth/roleBoundary';
import { isSessionBoundaryValid } from '../auth/roleBoundary';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'backend_unavailable' | 'error';

export interface AuthUser {
  id: string;
  name: string;
}

interface AuthContextType {
  role: Role;
  accountType: AccountType;
  user: AuthUser | null;
  status: AuthStatus;
  login: (payload: LoginPayload) => Promise<Role>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>(null);
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');

  const clearSession = useCallback((nextStatus: AuthStatus = 'unauthenticated', revokeRemote = false) => {
    if (revokeRemote) {
      authApi.logout().catch(() => {});
    }
    clearAccessToken();
    setRole(null);
    setAccountType(null);
    setUser(null);
    setStatus(nextStatus);
  }, []);

  const establishSession = useCallback((nextRole: Role, nextAccountType: AccountType, nextUser: AuthUser) => {
    if (!isSessionBoundaryValid(nextRole, nextAccountType)) {
      throw new Error('INVALID_SESSION_BOUNDARY');
    }

    setRole(nextRole);
    setAccountType(nextAccountType);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const refresh = await authApi.refresh();
      if (!isSessionBoundaryValid(refresh.role, refresh.account_type)) {
        clearSession('unauthenticated', true);
        return;
      }

      setAccessToken(refresh.access_token);
      const session = await authApi.me();
      if (
        !isSessionBoundaryValid(session.role, session.account_type) ||
        session.role !== refresh.role ||
        session.account_type !== refresh.account_type
      ) {
        clearSession('unauthenticated', true);
        return;
      }

      establishSession(session.role, session.account_type, {
        id: session.id,
        name: session.name || session.id,
      });
    } catch (e: any) {
      clearSession();
      
      // Distinguish backend transport failures vs auth rejection
      if (!e.response || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') {
        setStatus('backend_unavailable');
      } else if (e.response?.status === 401 || e.response?.status === 403) {
        setStatus('unauthenticated');
      } else {
        setStatus('error');
      }
    }
  }, [clearSession, establishSession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (payload: LoginPayload) => {
    const res = await authApi.login(payload);
    if (!isSessionBoundaryValid(res.role, res.account_type) || res.account_type !== payload.accountType) {
      clearSession('unauthenticated', true);
      throw new Error('ACCOUNT_TYPE_MISMATCH');
    }

    setAccessToken(res.access_token);
    establishSession(res.role, res.account_type, {
      id: res.userId,
      name: res.name || res.userId,
    });
    return res.role;
  };

  const logout = useCallback(() => {
    clearSession('unauthenticated', true);
  }, [clearSession]);

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
    <AuthContext.Provider value={{ role, accountType, user, status, login, logout }}>
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
