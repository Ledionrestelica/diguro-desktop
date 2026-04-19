import { eq, schema, sql, type Db } from '@diguro/db';
import { RESOURCE_UPLOADED, type InngestClient } from '../client.ts';
import type { Logger } from '../../lib/logger.ts';
import type { ObjectStore } from '../../ports/objectStore.ts';
import type { Extractor } from '../../ports/extractor.ts';
import type { Chunker } from '../../ports/chunker.ts';
import type { EmbedProvider } from '../../ports/embedProvider.ts';
import type { Contextualizer } from '../../ports/contextualizer.ts';
import { contextualizeChunks } from '../../services/rag/contextualize.ts';

/**
 * Ingestion pipeline for an uploaded resource.
 *
 * Current stages:
 *   ✓ 1. load version + download bytes from S3
 *   ✓ 2. extract text (PDF via unpdf w/ Mistral OCR fallback; MD/TXT passthrough)
 *   ✓ 3. chunk (sentence-aware + parent sections) → Chunk rows
 *   ✓ 4. contextualize (Haiku 4.5 prefix per chunk, with prompt caching)
 *   ✓ 5. embed (Voyage-3-large, batched 100) → Embedding rows
 *
 * Remaining:
 *     - entity extract (Haiku structured output)
 *     - summarize + key points (Sonnet)
 */
export function createResourceUploadedFunction(args: {
  inngest: InngestClient;
  db: Db;
  logger: Logger;
  objectStore: ObjectStore;
  extractor: Extractor;
  chunker: Chunker;
  embedProvider: EmbedProvider;
  contextualizer: Contextualizer | null;
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
      // Any non-DONE status is fair game for re-ingest. Each step is
      // idempotent: extract re-fetches from S3, chunk wipes prior rows
      // before insert, page-count overwrite is a set-same-value. A stuck
      // file (e.g. from an old pipeline version) can be kicked by a rerun
      // in the Inngest dashboard.
      if (version.status === 'PENDING_UPLOAD') {
        // Pre-upload confirm: we shouldn't be here. Event emitted before
        // confirmUpload flipped the status — wait for the real confirm.
        args.logger.warn('ingest skipped: still PENDING_UPLOAD', { versionId });
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

      await step.run('mark-chunking', async () => {
        await args.db
          .update(schema.resourceVersions)
          .set({ ingestStatus: 'CHUNKING' })
          .where(eq(schema.resourceVersions.id, versionId));
      });

      // Step 3: chunk + write Chunk rows. We also clear any chunks from a
      // previous failed run of this version so re-ingest is idempotent.
      const chunkCount = await step.run('chunk', async () => {
        const t0 = Date.now();
        const chunks = args.chunker.chunk({
          fullText: extracted.fullText,
          pages: extracted.pages,
        });
        const tChunker = Date.now() - t0;

        args.logger.info('chunker finished', {
          versionId,
          textChars: extracted.fullText.length,
          pageCount: extracted.pages.length,
          chunkCount: chunks.length,
          ms: tChunker,
        });

        if (chunks.length === 0) {
          args.logger.warn('chunker produced zero chunks', { versionId });
          return 0;
        }

        // Idempotency: drop any chunks already attached to this version
        // (retry / re-ingest scenarios) before inserting the new set.
        const tDeleteStart = Date.now();
        await args.db
          .delete(schema.chunks)
          .where(eq(schema.chunks.resourceVersionId, versionId));
        const tDelete = Date.now() - tDeleteStart;

        const rows = chunks.map((c) => ({
          id: crypto.randomUUID(),
          resourceVersionId: versionId,
          chunkIndex: c.chunkIndex,
          text: c.text,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          pageNumber: c.pageNumber,
          parentSectionId: c.parentSectionId,
          // Markdown chunker populates this with the heading path so the
          // embedding carries section context. Phase 3 LLM contextualizer
          // appends its own summary to whatever starts here.
          contextualPrefix: c.contextualPrefix ?? null,
        }));

        // Batch insert in slices of 500 to stay well under Postgres's
        // 65535-parameter statement cap (8 cols × 500 rows = 4000 params).
        const tInsertStart = Date.now();
        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
          await args.db.insert(schema.chunks).values(rows.slice(i, i + BATCH));
        }
        const tInsert = Date.now() - tInsertStart;

        args.logger.info('chunk step timings', {
          versionId,
          chunkerMs: tChunker,
          deleteMs: tDelete,
          insertMs: tInsert,
          totalMs: Date.now() - t0,
          batches: Math.ceil(rows.length / BATCH),
        });

        return rows.length;
      });

      args.logger.info('chunking complete', {
        versionId,
        resourceId,
        chunkCount,
      });

      // Step 4a: contextualize. Anthropic's "contextual retrieval" — a
      // 1-2 sentence prefix describing where this chunk lives in the doc.
      // Stored on chunks.contextual_prefix; the embed step prepends it
      // when available. Best-effort: if the contextualizer is missing or
      // fails, the embed step still runs with raw chunk text.
      if (args.contextualizer) {
        const contextualizer = args.contextualizer;
        await step.run('contextualize', async () => {
          const t0 = Date.now();
          const result = await contextualizeChunks(
            {
              db: args.db,
              contextualizer,
              logger: args.logger,
            },
            { resourceVersionId: versionId, fullText: extracted.fullText },
          );
          args.logger.info('contextualize step result', {
            versionId,
            ...result,
            totalMs: Date.now() - t0,
          });
          return result;
        });
      } else {
        args.logger.info(
          'contextualize skipped: no LLM configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)',
          { versionId },
        );
      }

      await step.run('mark-embedding', async () => {
        await args.db
          .update(schema.resourceVersions)
          .set({ ingestStatus: 'EMBEDDING' })
          .where(eq(schema.resourceVersions.id, versionId));
      });

      // Step 4b: embed. Load chunks from the DB (rather than passing them
      // through step state — keeps step input size small + ensures embed
      // is idempotent against the actual DB state on retry).
      const embedCount = await step.run('embed', async () => {
        const t0 = Date.now();
        const chunkRows = await args.db
          .select({
            id: schema.chunks.id,
            text: schema.chunks.text,
            contextualPrefix: schema.chunks.contextualPrefix,
          })
          .from(schema.chunks)
          .where(eq(schema.chunks.resourceVersionId, versionId));

        if (chunkRows.length === 0) {
          args.logger.warn('embed: no chunks to embed', { versionId });
          return 0;
        }

        // Idempotency: clear any embeddings left from a prior failed run.
        // Joining through chunks ensures we only touch embeddings tied to
        // this version.
        await args.db.execute(
          sql`DELETE FROM ${schema.embeddings}
              WHERE chunk_id IN (
                SELECT id FROM ${schema.chunks}
                WHERE resource_version_id = ${versionId}
              )`,
        );

        // When Phase 3 (contextual retrieval) lands, contextualPrefix will
        // be populated per chunk. Embedding the prefix + text combo gives
        // Anthropic's ~35% retrieval-failure reduction. Until then, prefix
        // is null and we just embed the raw text.
        const inputs = chunkRows.map((c) =>
          c.contextualPrefix
            ? `${c.contextualPrefix}\n\n${c.text}`
            : c.text,
        );

        // Voyage accepts up to 128 per request; our adapter caps at 100
        // and batches internally. One call per 100 chunks is fine.
        const VOYAGE_BATCH = 100;
        const vectors: number[][] = [];
        const tVoyageStart = Date.now();
        for (let i = 0; i < inputs.length; i += VOYAGE_BATCH) {
          const slice = inputs.slice(i, i + VOYAGE_BATCH);
          const batch = await args.embedProvider.embedDocuments(slice);
          vectors.push(...batch);
        }
        const tVoyage = Date.now() - tVoyageStart;

        if (vectors.length !== chunkRows.length) {
          throw new Error(
            `Voyage returned ${vectors.length} vectors for ${chunkRows.length} chunks`,
          );
        }

        // Batch inserts — 2 columns per row, so we're nowhere near the
        // 65535-param cap even at 1000 per batch.
        const tInsertStart = Date.now();
        const INSERT_BATCH = 500;
        for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
          const rows = chunkRows.slice(i, i + INSERT_BATCH).map((c, j) => {
            const vec = vectors[i + j];
            if (!vec) throw new Error(`missing vector at ${i + j}`);
            return { chunkId: c.id, vector: vec };
          });
          await args.db.insert(schema.embeddings).values(rows);
        }
        const tInsert = Date.now() - tInsertStart;

        args.logger.info('embed step timings', {
          versionId,
          chunkCount: chunkRows.length,
          voyageMs: tVoyage,
          insertMs: tInsert,
          totalMs: Date.now() - t0,
          voyageCalls: Math.ceil(inputs.length / VOYAGE_BATCH),
        });

        return chunkRows.length;
      });

      await step.run('mark-done', async () => {
        await args.db
          .update(schema.resourceVersions)
          .set({ ingestStatus: 'DONE' })
          .where(eq(schema.resourceVersions.id, versionId));
      });

      args.logger.info('ingest complete', {
        versionId,
        resourceId,
        chunkCount,
        embedCount,
      });

      return {
        ok: true,
        status: 'DONE' as const,
        versionId,
        resourceId,
        pageCount: extracted.pages.length,
        fullTextChars: extracted.fullText.length,
        ocrUsed: extracted.ocrUsed,
        chunkCount,
        embedCount,
      };
    },
  );
}
