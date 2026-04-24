/**
 * API base URL, with a sensible localhost default for dev. Override at
 * deploy time via the standard Vite env convention:
 *   VITE_API_URL=https://api.diguro.se pnpm build
 */
const rawApiUrl: unknown = import.meta.env.VITE_API_URL;
export const API_URL: string =
  typeof rawApiUrl === 'string' && rawApiUrl.length > 0
    ? rawApiUrl
    : 'http://localhost:3000';
