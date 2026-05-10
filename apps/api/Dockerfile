# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Multi-stage build for apps/api.
# - deps   : restore pnpm workspace dependencies with cache mounts.
# - build  : no-op for Bun (TypeScript runs natively), prune dev deps.
# - run    : slim runtime image, non-root user, only what's needed.
# -----------------------------------------------------------------------------

# --- Stage 1: deps ---
FROM oven/bun:1.3-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/pnpm/pnpm/releases/download/v10.33.0/pnpm-linuxstatic-x64 -o /usr/local/bin/pnpm \
 && chmod +x /usr/local/bin/pnpm \
 && pnpm --version

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/trpc/package.json packages/trpc/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
 && pnpm install --frozen-lockfile --filter @diguro/api... --prod=false

# --- Stage 2: build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @diguro/api... typecheck

# --- Stage 3: runtime ---
FROM oven/bun:1.3-slim AS run
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Make the start script executable inside the image. We chmod here (not
# in the deps stage) so the file mode survives the COPY into runtime
# regardless of how the host filesystem represents the bit.
RUN chmod +x /app/apps/api/scripts/start.sh \
 && chown -R bun:bun /app
USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-3000}/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# The start script runs `drizzle migrate` then exec's the server. See
# apps/api/scripts/start.sh for the rationale around concurrent rollouts.
CMD ["/app/apps/api/scripts/start.sh"]
