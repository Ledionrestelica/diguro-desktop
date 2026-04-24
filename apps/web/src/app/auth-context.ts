import { createContext, useContext } from 'react';

/**
 * Shim for `@/app/auth-context` — identical shape to desktop's so the
 * same `useAuth()` calls work when desktop components are built under
 * the web app.
 */
export interface AuthContextValue {
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>');
  return ctx;
}
