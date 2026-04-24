import { API_URL } from './api';

/**
 * Web-side drop-in for `@/lib/api-auth`. Same export surface as the
 * desktop version (`apiAuth.signIn`, `apiAuth.signUp`, `apiAuth.signOut`)
 * but swaps bearer tokens for cookie sessions. Every request sets
 * `credentials: 'include'` so the browser attaches / picks up the
 * Better-Auth cookie automatically.
 */

type AuthError = { error: string };
type SignInResponse = { user: { id: string; email: string } };

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

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
  },
};
