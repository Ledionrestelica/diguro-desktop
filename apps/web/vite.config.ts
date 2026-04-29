import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
  // loadEnv reads .env, .env.local, .env.[mode], .env.[mode].local
  // from the cwd. Without prefix '' it returns every var (default
  // would limit to VITE_-prefixed). We need this so VITE_DEV_API_PROXY_TARGET
  // in apps/web/.env.local is visible to the dev-server config below.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget =
    env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:3000';
  const proxyIsRemote = /^https:\/\//.test(proxyTarget);

  return {
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
    // origin (localhost:5174), then Vite forwards to the API. This lets
    // Better-Auth's cookies stay same-site and dodges all the
    // cross-origin Set-Cookie / SameSite headaches.
    //
    // Override the proxy target with VITE_DEV_API_PROXY_TARGET to point
    // local dev at the deployed API instead of a local one:
    //
    //   VITE_DEV_API_PROXY_TARGET=https://api.diguro.se pnpm dev
    //
    // Or persist it in apps/web/.env.local. When the target is HTTPS,
    // we flip changeOrigin + cookieDomainRewrite so Better-Auth's
    // Secure;SameSite=None cookies survive the localhost rewrite.
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: proxyIsRemote,
        secure: proxyIsRemote,
        // Chat streams SSE / chunked. Without ws:true the upgrade works
        // fine but we also want long-lived POSTs to stay open.
        ws: true,
        // When proxying to a remote HTTPS host, rewrite Set-Cookie
        // domain attribute to localhost so the browser actually
        // stores the auth cookie under our dev origin.
        cookieDomainRewrite: proxyIsRemote ? 'localhost' : '',
      },
      '/trpc': {
        target: proxyTarget,
        changeOrigin: proxyIsRemote,
        secure: proxyIsRemote,
        cookieDomainRewrite: proxyIsRemote ? 'localhost' : '',
      },
    },
  },
  build: {
    outDir: 'dist',
    // Disabled in prod: the 6.9 MB sourcemap was OOM-killing Coolify's
    // build container right after module transformation. Re-enable for
    // local debugging via `vite build --sourcemap` if needed.
    sourcemap: false,
  },
  };
});
