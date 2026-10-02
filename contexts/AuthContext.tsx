import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import {
  getUser,
  saveUser,
  clearUser,
  addAuditLog,
  type User,
  type UserRole,
} from '@/lib/storage';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, name: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getUser();
      setUser(stored);
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, name: string, role: UserRole) => {
    const newUser: User = {
      id: Crypto.randomUUID(),
      email,
      name,
      role,
      createdAt: new Date().toISOString(),
    };
    await saveUser(newUser);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await clearUser();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
