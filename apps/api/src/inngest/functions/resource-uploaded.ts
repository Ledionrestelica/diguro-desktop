import { eq, schema, type Db } from '@diguro/db';
import { RESOURCE_UPLOADED, type InngestClient } from '../client.ts';
import type { Logger } from '../../lib/logger.ts';
import type { ObjectStore } from '../../ports/objectStore.ts';
import type { Extractor } from '../../ports/extractor.ts';

/**
 * Ingestion pipeline for an uploaded resource.
 *
 * Current stages (Phase 1a complete):
 *   ✓ 1. load version + download bytes from S3
 *   ✓ 2. extract text (PDF via unpdf w/ Mistral OCR fallback; MD/TXT/CSV/JSON passthrough)
 *
 * Remaining (Phase 2+):
 *     3. chunk (sentence-aware + parent sections) → Chunk rows
 *     4. contextualize (Haiku 4.5 prefix per chunk, with prompt caching)
 *     5. embed (Voyage-3-large, batched 100)
 *     6. entity extract (Haiku structured output)
 *     7. summarize + key points (Sonnet)
 *     8. mark DONE
 */
export function createResourceUploadedFunction(args: {
  inngest: InngestClient;
  db: Db;
  logger: Logger;
  objectStore: ObjectStore;
  extractor: Extractor;
}) {
  return args.inngest.createFunction(
    {
      id: 'resource-uploaded',
      name: 'Ingest uploaded resource',
      retries: 3,
      triggers: [{ event: RESOURCE_UPLOADED }],
    },
    async ({ event, step }) => {
      const { versionId, resourceId } = event.data;

      const version = await step.run('load-version', async () => {
        const rows = await args.db
          .select({
            id: schema.resourceVersions.id,
            status: schema.resourceVersions.ingestStatus,
            s3Key: schema.resourceVersions.s3Key,
            mimeType: schema.resourceVersions.mimeType,
            fileSize: schema.resourceVersions.fileSize,
          })
          .from(schema.resourceVersions)
          .where(eq(schema.resourceVersions.id, versionId))
          .limit(1);
        const v = rows[0];
        if (!v) throw new Error(`ResourceVersion ${versionId} not found`);
        return v;
      });

      if (version.status === 'DONE') {
        args.logger.info('ingest skipped: already DONE', { versionId });
        return { ok: true, status: 'DONE' as const };
      }
      if (version.status !== 'PENDING' && version.status !== 'FAILED') {
        args.logger.info('ingest skipped: status not PENDING', {
          versionId,
          status: version.status,
        });
        return { ok: true, status: version.status };
      }

      await step.run('mark-extracting', async () => {
        await args.db
          .update(schema.resourceVersions)
          .set({ ingestStatus: 'EXTRACTING' })
          .where(eq(schema.resourceVersions.id, versionId));
      });

      // Step 2: download + extract. We compute both bytes and a presigned
      // URL so the extractor can hand the URL to OCR providers that fetch
      // directly (no base64 round-trip).
      const extracted = await step.run('extract', async () => {
        const [bytes, sourceUrl] = await Promise.all([
          args.objectStore.getBytes(version.s3Key),
          args.objectStore.presignGet({
            key: version.s3Key,
            expiresInSeconds: 30 * 60,
          }),
        ]);

        const filename = version.s3Key.split('/').pop() ?? 'unknown';
        return args.extractor.extract({
          bytes,
          mimeType: version.mimeType,
          filename,
          sourceUrl,
        });
      });

      args.logger.info('extraction complete', {
        versionId,
        resourceId,
        pageCount: extracted.pages.length,
        fullTextChars: extracted.fullText.length,
        ocrUsed: extracted.ocrUsed,
        ocrPageCount: extracted.ocrPageCount,
      });

      // Persist page count (useful metadata) even before chunking lands.
      if (extracted.pages.length > 0) {
        await step.run('update-page-count', async () => {
          await args.db
            .update(schema.resourceVersions)
            .set({ pageCount: extracted.pages.length })
            .where(eq(schema.resourceVersions.id, versionId));
        });
      }

      // TODO Phase 2+: chunk → contextualize → embed → entities → summary.
      // Each as its own step.run for isolated retries. We return the
      // extracted text from this function for now so the Inngest dev UI
      // shows it; next phases will consume it directly.

      return {
        ok: true,
        status: 'EXTRACTED' as const,
        versionId,
        resourceId,
        pageCount: extracted.pages.length,
        fullTextChars: extracted.fullText.length,
        ocrUsed: extracted.ocrUsed,
      };
    },
  );
}
