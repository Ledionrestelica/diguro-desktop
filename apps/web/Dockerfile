# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Multi-stage build for apps/web.
# - deps   : restore pnpm workspace dependencies for @diguro/web.
# - build  : run vite build (resolves @ aliases into apps/desktop/src).
# - run    : tiny Caddy image. Serves the SPA + reverse-proxies /api and
#            /trpc to api.diguro.se so the same-origin tRPC client keeps
#            working in production without any code changes.
# -----------------------------------------------------------------------------

# --- Stage 1: deps ---
FROM oven/bun:1.3-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/pnpm/pnpm/releases/download/v10.33.0/pnpm-linuxstatic-x64 -o /usr/local/bin/pnpm \
 && chmod +x /usr/local/bin/pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/trpc/package.json packages/trpc/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
 && pnpm install --frozen-lockfile --filter @diguro/web... --prod=false

# --- Stage 2: build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @diguro/web build

# --- Stage 3: runtime ---
FROM caddy:2-alpine AS run
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
