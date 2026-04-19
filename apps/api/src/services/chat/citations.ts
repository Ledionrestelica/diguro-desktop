import { eq, inArray, schema, type Db } from '@diguro/db';
import type { MessagePart } from '@diguro/shared';

/**
 * Parse `[cite:chunkId]` markers out of assistant text parts, validate
 * that each referenced chunk exists (guards against hallucinated ids),
 * and write Citation rows linking message → chunk.
 *
 * Kept deliberately forgiving: we don't fail the chat turn if parsing
 * finds no markers or all markers are invalid — we just skip them. Better
 * UX than blowing up the whole reply over a bad id from the model.
 */

const CITATION_RE = /\[cite:([a-zA-Z0-9-]+)\]/g;

export interface PersistCitationsInput {
  messageId: string;
  parts: MessagePart[];
}

export async function persistCitationsFromMessage(
  deps: { db: Db },
  input: PersistCitationsInput,
): Promise<number> {
  const chunkIds = extractCitedChunkIds(input.parts);
  if (chunkIds.length === 0) return 0;

  // Guard: resolve which ids actually exist. The model can hallucinate
  // ids even when we prompt against it — dropping invalids here prevents
  // FK violations on insert.
  const existing = await deps.db
    .select({
      id: schema.chunks.id,
      text: schema.chunks.text,
    })
    .from(schema.chunks)
    .where(inArray(schema.chunks.id, chunkIds));
  const validIds = new Set(existing.map((r) => r.id));
  const snippetById = new Map(existing.map((r) => [r.id, r.text]));

  // Dedupe while preserving first-seen order — that's the citation rank
  // the user sees ([1], [2], ... in the order the model referenced them).
  const ranked: Array<{ chunkId: string; rank: number }> = [];
  const seen = new Set<string>();
  for (const id of chunkIds) {
    if (!validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ranked.push({ chunkId: id, rank: ranked.length + 1 });
  }

  if (ranked.length === 0) return 0;

  // Idempotency: if this message was re-saved (streaming retry), wipe
  // prior citations first. Safer than relying on unique-index conflicts.
  await deps.db
    .delete(schema.citations)
    .where(eq(schema.citations.messageId, input.messageId));

  const rows = ranked.map((r) => ({
    id: crypto.randomUUID(),
    messageId: input.messageId,
    chunkId: r.chunkId,
    rank: r.rank,
    // Store a short snippet for the UI — the chunk text itself may be
    // up to 1500 chars, snippet keeps the citation panel compact.
    snippet: (snippetById.get(r.chunkId) ?? '').slice(0, 500),
  }));
  await deps.db.insert(schema.citations).values(rows);
  return rows.length;
}

function extractCitedChunkIds(parts: MessagePart[]): string[] {
  const ids: string[] = [];
  for (const p of parts) {
    // Narrow to the text variant of the discriminated union.
    if (!('text' in p) || p.type !== 'text') continue;
    let match: RegExpExecArray | null;
    CITATION_RE.lastIndex = 0;
    while ((match = CITATION_RE.exec(p.text)) !== null) {
      const id = match[1];
      if (id) ids.push(id);
    }
  }
  return ids;
}
