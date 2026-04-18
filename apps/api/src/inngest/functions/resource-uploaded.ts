import { eq, schema, type Db } from '@diguro/db';
import { RESOURCE_UPLOADED, type InngestClient } from '../client.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * Ingestion pipeline for an uploaded resource. This is the Phase 0 skeleton:
 * it validates the event, confirms the ResourceVersion exists, and flips
 * status to EXTRACTING. Subsequent phases hang more `step.run(...)` blocks
 * off this function — each step gets its own retry envelope from Inngest.
 *
 * Planned steps. OCR is mandatory — our target users (municipalities,
 * document-heavy organizations) have archives where ~60% of PDFs are
 * scanned paper without a text layer.
 *   1. load version + download bytes from S3 (stream)
 *   2. extract text:
 *        PDF: pdf-parse for text layer; if <N chars extracted, fall back
 *          to GPT-5 Vision OCR per page.
 *        DOCX: mammoth.
 *        XLSX / CSV: xlsx → markdown tables.
 *        MD / TXT / HTML: passthrough / cheerio.
 *   3. chunk (sentence-aware + parent sections)
 *   4. contextualize (Haiku 4.5 prefix per chunk, with prompt caching)
 *   5. embed (Voyage-3-large, batched 100)
 *   6. entity extract (Haiku structured output)
 *   7. summarize + key points (Sonnet)
 *   8. mark DONE, emit `resource.ready`
 */
export function createResourceUploadedFunction(args: {
  inngest: InngestClient;
  db: Db;
  logger: Logger;
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

      // TODO Phase 1+: extraction → chunking → contextual prefix → embedding
      // → entity extraction → summary. Each as its own step.run for isolated
      // retries. For now the function is a skeleton that proves wiring.

      args.logger.info('ingest skeleton reached — next phases TODO', {
        versionId,
        resourceId,
        mimeType: version.mimeType,
        fileSize: version.fileSize,
      });

      return {
        ok: true,
        status: 'EXTRACTING' as const,
        versionId,
        resourceId,
      };
    },
  );
}
