/**
 * Resolves the API base URL once for the whole app. Intended to be the
 * single source of truth for `lib/api-auth`, `lib/trpc-client`, and
 * `features/chat/useChatSession` — all of which previously each read
 * `import.meta.env.VITE_API_URL` with their own dev fallback.
 *
 * Resolution order:
 *   1. `import.meta.env.VITE_API_URL` if set at build time.
 *   2. `http://localhost:3000` only when running in dev (`import.meta.env.DEV`).
 *   3. Otherwise: throw at module load. Better than letting a downloaded
 *      production build silently target localhost and confuse the user
 *      with "fetch failed" errors that look like a network problem.
 */
const fromEnv = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.DEV;

function resolve(): string {
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, '');
  if (isDev) return 'http://localhost:3000';
  throw new Error(
    'VITE_API_URL is not set in this build. ' +
      'Production desktop builds must bake the API URL at compile time. ' +
      'Set VITE_API_URL in the CI environment (e.g. https://api.diguro.se) ' +
      'and rebuild.',
  );
}

export const API_URL = resolve();
