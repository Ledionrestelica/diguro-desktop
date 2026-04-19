import type { Db } from '@diguro/db';
import { createInngestClient, type InngestClient } from './client.ts';
import { createResourceUploadedFunction } from './functions/resource-uploaded.ts';
import type { Logger } from '../lib/logger.ts';
import type { Config } from '../config.ts';
import type { ObjectStore } from '../ports/objectStore.ts';
import type { Extractor } from '../ports/extractor.ts';
import type { Chunker } from '../ports/chunker.ts';
import type { EmbedProvider } from '../ports/embedProvider.ts';
import type { Contextualizer } from '../ports/contextualizer.ts';

/**
 * Wire the Inngest client + all its functions. Returns the client (for the
 * Queue adapter) and the functions array (for `serve` on Hono). Central
 * place to add new functions — the hono mount and dev/prod setup don't
 * need to change when a new handler is added.
 */
export function createInngest(deps: {
  db: Db;
  logger: Logger;
  config: Config;
  objectStore: ObjectStore;
  extractor: Extractor;
  chunker: Chunker;
  embedProvider: EmbedProvider;
  contextualizer: Contextualizer | null;
}) {
  const client: InngestClient = createInngestClient({
    eventKey: deps.config.INNGEST_EVENT_KEY,
    signingKey: deps.config.INNGEST_SIGNING_KEY,
    isDev: deps.config.NODE_ENV !== 'production',
  });

  const functions = [
    createResourceUploadedFunction({
      inngest: client,
      db: deps.db,
      logger: deps.logger,
      objectStore: deps.objectStore,
      extractor: deps.extractor,
      chunker: deps.chunker,
      embedProvider: deps.embedProvider,
      contextualizer: deps.contextualizer,
    }),
  ];

  return { client, functions };
}
