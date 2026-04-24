import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Web companion — reuses desktop's React tree via a two-tier `@` alias:
 *
 *   1. Specific overrides (auth storage, tRPC client, AI-SDK transport,
 *      app shell) point at web's own src/. These are the files that
 *      differ between Electron bearer-auth and web cookie-auth.
 *
 *   2. Everything else falls through to `apps/desktop/src`. Imports like
 *      `@/features/chat/Composer` resolve to the desktop component, but
 *      its internal `@/lib/trpc-client` resolves (at Vite build time) to
 *      THIS web shim — so chat streams via cookies, not Electron
 *      keychain-backed bearers.
 *
 * Vite alias arrays are order-sensitive: first match wins. Keep the
 * overrides before the generic `@` rule.
 */
const webSrc = path.resolve(__dirname, 'src');
const desktopSrc = path.resolve(__dirname, '../desktop/src');

const override = (rel: string) => ({
  find: `@/${rel}`,
  replacement: path.resolve(webSrc, `${rel}.ts`),
});
const overrideTsx = (rel: string) => ({
  find: `@/${rel}`,
  replacement: path.resolve(webSrc, `${rel}.tsx`),
});
const overrideDir = (rel: string) => ({
  find: `@/${rel}`,
  replacement: path.resolve(webSrc, rel),
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Web-specific overrides (auth, transport, shell). Every component
      // tree shared with desktop imports `@/lib/*` and `@/app/*`; these
      // override rules ensure those resolve to web's shims at build time.
      override('lib/auth-store'),
      override('lib/api-auth'),
      override('lib/trpc'),
      override('lib/trpc-client'),
      override('lib/utils'),
      override('lib/api'),
      override('features/chat/useChatSession'),
      overrideTsx('app/App'),
      overrideTsx('app/AuthGate'),
      overrideTsx('app/router'),
      override('app/auth-context'),
      // Fall-through: shared desktop tree (components/ui, features, hooks).
      { find: '@', replacement: desktopSrc },
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
    // Dev proxy so every API call from the browser goes out to the same
    // origin (localhost:5174), then Vite forwards to the API (3000).
    // This lets Better-Auth's cookies stay same-site and dodges all the
    // cross-origin Set-Cookie / SameSite headaches. In prod the web
    // bundle + API sit on the same domain anyway (app.diguro.se →
    // rewrite /api/* to api.diguro.se, or subdomain with shared parent).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        // Chat streams SSE / chunked. Without ws:true the upgrade works
        // fine but we also want long-lived POSTs to stay open.
        ws: true,
      },
      '/trpc': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
