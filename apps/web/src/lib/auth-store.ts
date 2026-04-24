/**
 * Web-side shim for the bearer-token `authStore` desktop components import.
 *
 * Web auth is cookie-based — Better-Auth sets an httpOnly session cookie
 * on sign-in and the browser attaches it automatically. There is no
 * bearer token to store, so every get() returns null and set/clear are
 * no-ops. Desktop components that call `authStore.get()` to set an
 * `authorization` header simply see no token, and the tRPC/streaming
 * clients fall back to `credentials: 'include'` (configured in our
 * web-side trpc-client.ts and useChatSession.ts shims).
 */
export const authStore = {
  async get(): Promise<string | null> {
    return null;
  },
  async set(_token: string | null): Promise<void> {
    /* web doesn't store tokens client-side; cookies handle persistence */
  },
  clear(): void {
    /* no-op — sign-out hits /api/auth/sign-out which clears the cookie */
  },
};
