#!/bin/sh
# API container entrypoint: run pending migrations, then exec the server.
#
# Migrations are idempotent (Drizzle journal-tracked) so it's safe for
# every container instance to run them on boot. With multiple instances
# rolling out simultaneously, Postgres serializes the actual DDL via the
# advisory lock Drizzle takes inside `migrate()` — only one runs at a
# time and the rest see an up-to-date journal and no-op.
#
# `exec` replaces the shell with the API process so signals (SIGTERM
# from the orchestrator on rolling restart) reach Bun directly and shut
# down gracefully instead of being swallowed by the shell wrapper.

set -e

echo "[start.sh] Running database migrations…"
bun run /app/packages/db/src/migrate.ts

echo "[start.sh] Starting API server…"
exec bun run /app/apps/api/src/index.ts
