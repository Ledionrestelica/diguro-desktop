/**
 * API base URL. Empty string by default so every request becomes a
 * relative path (`/api/...`, `/trpc/...`) — Vite's dev proxy forwards
 * those to the API, keeping the browser origin same-site so Better-Auth
 * cookies round-trip without `SameSite=None; Secure` gymnastics.
 *
 * In production, set `VITE_API_URL` to the deployed API origin (or leave
 * empty and route `/api/*` + `/trpc/*` at the edge, e.g. via Vercel
 * rewrites / Cloudflare rules, to the API service). Same-origin requests
 * avoid every CORS + cookie edge case.
 */
const rawApiUrl: unknown = import.meta.env.VITE_API_URL;
export const API_URL: string =
  typeof rawApiUrl === 'string' && rawApiUrl.length > 0 ? rawApiUrl : '';
