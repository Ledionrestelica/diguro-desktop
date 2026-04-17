/**
 * Thin wrapper around the preload bridge for the bearer token.
 * Memoizes the token in-memory for hot reads while keeping disk as SoT.
 */
let cached: string | null | undefined;

export const authStore = {
  async get(): Promise<string | null> {
    if (cached !== undefined) return cached;
    cached = (await window.diguro.auth.getToken()) ?? null;
    return cached;
  },
  async set(token: string | null): Promise<void> {
    cached = token;
    await window.diguro.auth.setToken(token);
  },
  clear(): void {
    cached = null;
    void window.diguro.auth.setToken(null);
  },
};
