import { authStore } from './auth-store.ts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type AuthError = { error: string };
type SignInResponse = { user: { id: string; email: string } };

async function call<T>(path: string, body: unknown): Promise<T> {
  const token = await authStore.get();
  const res = await fetch(`${API_URL}/api/auth${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'omit',
    body: JSON.stringify(body),
  });

  const setAuthToken = res.headers.get('set-auth-token');
  if (setAuthToken) await authStore.set(setAuthToken);

  const json = (await res.json().catch(() => ({}))) as T | AuthError;
  if (!res.ok) {
    const msg = (json as AuthError).error ?? `Auth request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

export const apiAuth = {
  signUp: (email: string, password: string, name: string) =>
    call<SignInResponse>('/sign-up/email', { email, password, name }),

  signIn: (email: string, password: string) =>
    call<SignInResponse>('/sign-in/email', { email, password }),

  signOut: async () => {
    await call<{ success: boolean }>('/sign-out', {}).catch(() => undefined);
    authStore.clear();
  },
};
