import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createDb } from '@diguro/db';
import { loadConfig } from './config.ts';
import { createLogger } from './lib/logger.ts';
import { createAuth } from './auth/config.ts';
import { buildCtx } from './context.ts';
import { appRouter } from './trpc/root.ts';
import { createModelRegistry } from './ai/registry.ts';
import { handleChat } from './hono/chat-route.ts';
import { createS3ObjectStore } from './adapters/s3/index.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = createDb(config.DATABASE_URL);
const auth = createAuth(db, config);
const modelRegistry = createModelRegistry(config);
const objectStore = createS3ObjectStore(config);

const app = new Hono();

app.use('*', honoLogger((msg) => logger.info(msg)));

app.use(
  '*',
  cors({
    origin: (origin) => (config.ALLOWED_ORIGINS.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['Set-Auth-Token'],
  }),
);

app.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.post(
  '/api/chat',
  handleChat({ auth, registry: modelRegistry, db, logger, objectStore }),
);

app.all('/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () =>
      buildCtx({ db, auth, config, logger, objectStore }, c.req.raw),
  }),
);

logger.info('API boot', {
  port: config.PORT,
  env: config.NODE_ENV,
  origins: config.ALLOWED_ORIGINS,
});

export default {
  port: config.PORT,
  fetch: app.fetch,
  // Bun defaults to 10s idle timeout — too short for LLM streams where the
  // model may pause 20-60s mid-reasoning before emitting the next chunk.
  // Max is 255s. If a stream is genuinely stuck for 4 minutes, we want the
  // connection cleaned up rather than hung forever.
  idleTimeout: 240,
};
