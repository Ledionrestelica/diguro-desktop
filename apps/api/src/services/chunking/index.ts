import type { Chunk, Chunker, ChunkerInput } from '../../ports/chunker.ts';

/**
 * Default chunker. Sentence-aware split into ~400-token chunks with a
 * 2-sentence overlap for continuity, plus parent-section grouping up to
 * ~1500 tokens for parent-doc retrieval.
 *
 * Why sentence-aware with overlap:
 *   - Retrieval works best when chunks are self-contained thoughts.
 *     Splitting mid-sentence at a fixed char boundary produces garbage
 *     chunks for both embedding and the chat model.
 *   - Overlap means a concept mentioned at a chunk boundary still appears
 *     intact inside at least one chunk, so vector search can find it.
 *   - Parent sections (larger windows) let the model see surrounding
 *     context at query time even when the small-chunk match was narrow.
 *
 * Token counting is approximated as chars/4 — good enough for English;
 * chunking accuracy doesn't need to be tokenizer-perfect.
 */

/** Target tokens per chunk (rough — English averages ~4 chars/token). */
const TARGET_CHUNK_TOKENS = 400;
/** Sentences carried over into the next chunk as overlap. */
const OVERLAP_SENTENCES = 2;
/** Max tokens before we start a new parent section. */
const PARENT_SECTION_TOKENS = 1500;

const CHARS_PER_TOKEN = 4;

/**
 * Safety cap — no single doc should produce more than this many chunks.
 * Guards against pathological OCR output (a doc that's all punctuation, for
 * example) and against inserts hitting Postgres's 65535-parameter ceiling
 * (we have ~8 columns × 8000 rows = 64k).
 */
const MAX_CHUNKS_PER_DOC = 4000;
/**
 * If a "sentence" from the splitter is bigger than this, force-split it at
 * whitespace. Avoids a single paragraph with no punctuation ballooning into
 * a chunk that's too big to embed.
 */
const MAX_SENTENCE_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN; // ~1600 chars

export function createChunker(): Chunker {
  return {
    chunk: chunkDocument,
  };
}

export function chunkDocument(input: ChunkerInput): Chunk[] {
  const chunks = looksLikeMarkdown(input.fullText)
    ? chunkMarkdown(input)
    : chunkPlainText(input);

  if (chunks.length > MAX_CHUNKS_PER_DOC) {
    throw new Error(
      `Chunker produced ${chunks.length} chunks (max ${MAX_CHUNKS_PER_DOC}). ` +
        `Likely pathological extraction output — check the extract step's text.`,
    );
  }

  return chunks;
}

/**
 * Heuristic: count markdown heading lines. Needs at least 2 to be worth
 * the structural overhead — a single decorative `# Title` on a PDF's first
 * extracted page would otherwise force header-path chunking where it
 * isn't useful.
 */
function looksLikeMarkdown(text: string): boolean {
  const matches = text.match(/^#{1,6}\s+\S/gm);
  return (matches?.length ?? 0) >= 2;
}

function chunkPlainText(input: ChunkerInput): Chunk[] {
  const sentences = splitSentences(input.fullText);
  if (sentences.length === 0) return [];
  const pageOffsets = buildPageOffsets(input.pages);
  const rawChunks = groupIntoChunks(sentences);
  return annotateChunks(rawChunks, pageOffsets);
}

/* ------------------------------ sentences ------------------------------ */

interface Sentence {
  text: string;
  /** Absolute start offset in the full text. */
  start: number;
  /** Absolute end offset in the full text (exclusive). */
  end: number;
}

/**
 * Sentence splitter backed by Intl.Segmenter with granularity 'sentence'.
 *
 * Critical for RAG quality on structured docs. A naive `[.!?\n]` regex
 * breaks on the `.` inside section numbers ("4.1", "9.2", "v3.2"), version
 * strings ("Node 22.12.1"), URLs ("foo.com"), and decimals ("1.5%").
 * Each false split chops a chunk boundary through a heading or fact,
 * detaching the topic label from the content and wrecking retrieval for
 * that section.
 *
 * Intl.Segmenter is built into Bun/Node/browsers and understands that
 * "4.1 Identity and Authentication" is one sentence — the period is
 * between digits, not terminal. It also correctly handles "Mr.", "Dr.",
 * abbreviations, and sentence ends across paragraphs.
 */
function splitSentences(text: string): Sentence[] {
  if (text.length === 0) return [];
  const out: Sentence[] = [];
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const segment of segmenter.segment(text)) {
    const raw = segment.segment;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const leadingWs = raw.length - raw.trimStart().length;
    const trailingWs = raw.length - raw.trimEnd().length;
    const start = segment.index + leadingWs;
    const end = segment.index + raw.length - trailingWs;
    // Break any super-long "sentence" (e.g. a paragraph without periods
    // or a long OCR'd line) into pieces at whitespace. Prevents a single
    // chunk from ballooning past embedding context limits.
    if (trimmed.length > MAX_SENTENCE_CHARS) {
      for (const piece of hardSplit(trimmed, start)) out.push(piece);
    } else {
      out.push({ text: trimmed, start, end });
    }
  }
  return out;
}

function hardSplit(text: string, baseOffset: number): Sentence[] {
  const out: Sentence[] = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + MAX_SENTENCE_CHARS, text.length);
    // Prefer to break at whitespace if one exists in the window's tail.
    let breakAt = end;
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > pos) breakAt = lastSpace;
    }
    const slice = text.slice(pos, breakAt).trim();
    if (slice.length > 0) {
      out.push({
        text: slice,
        start: baseOffset + pos,
        end: baseOffset + breakAt,
      });
    }
    pos = breakAt === pos ? end : breakAt; // guaranteed to advance
  }
  return out;
}

/* ------------------------------ chunking ------------------------------ */

function groupIntoChunks(sentences: Sentence[]): Sentence[][] {
  const targetChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
  const chunks: Sentence[][] = [];
  let current: Sentence[] = [];
  let charsInCurrent = 0;

  for (const s of sentences) {
    current.push(s);
    charsInCurrent += s.text.length + 1;
    if (charsInCurrent >= targetChars) {
      chunks.push(current);
      // Carry overlap into the next chunk.
      const overlap = current.slice(Math.max(0, current.length - OVERLAP_SENTENCES));
      current = overlap;
      charsInCurrent = overlap.reduce((n, x) => n + x.text.length + 1, 0);
    }
  }
  // Emit final chunk only if it has content beyond the overlap — pure
  // overlap would be a near-duplicate of the prior chunk.
  if (current.length > OVERLAP_SENTENCES) {
    chunks.push(current);
  } else if (chunks.length === 0 && current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/* ------------------------------ annotation ------------------------------ */

interface PageOffset {
  pageNumber: number;
  start: number;
  end: number;
}

/**
 * Derive page boundaries inside the full text. The extractor joins pages
 * with `\n\n`, so each page's text starts `prevEnd + 2` into the full
 * string. If the extractor reports no pages (MD/TXT), every chunk's
 * `pageNumber` ends up null — which matches the schema (nullable).
 */
function buildPageOffsets(pages: ChunkerInput['pages']): PageOffset[] {
  if (pages.length === 0) return [];
  const out: PageOffset[] = [];
  let cursor = 0;
  for (const p of pages) {
    const start = cursor;
    const end = start + p.text.length;
    out.push({ pageNumber: p.pageNumber, start, end });
    cursor = end + 2; // matches the "\n\n" join in extractors
  }
  return out;
}

function pageForOffset(offset: number, pages: PageOffset[]): number | null {
  if (pages.length === 0) return null;
  for (const p of pages) {
    if (offset >= p.start && offset < p.end) return p.pageNumber;
  }
  // Out of range (blank trailing content) — attribute to last page.
  const last = pages[pages.length - 1];
  return last?.pageNumber ?? null;
}

function annotateChunks(
  rawChunks: Sentence[][],
  pageOffsets: PageOffset[],
): Chunk[] {
  const parentMaxChars = PARENT_SECTION_TOKENS * CHARS_PER_TOKEN;
  const annotated: Chunk[] = [];

  let parentId = crypto.randomUUID();
  let parentChars = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const group = rawChunks[i];
    if (!group || group.length === 0) continue;
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    const text = group.map((s) => s.text).join(' ');

    // Start a new parent section if adding this chunk overflows the
    // section budget. First chunk always opens a section.
    if (parentChars > 0 && parentChars + text.length > parentMaxChars) {
      parentId = crypto.randomUUID();
      parentChars = 0;
    }
    parentChars += text.length;

    annotated.push({
      chunkIndex: i,
      text,
      startOffset: first.start,
      endOffset: last.end,
      pageNumber: pageForOffset(first.start, pageOffsets),
      parentSectionId: parentId,
    });
  }

  return annotated;
}

/* ------------------------------ markdown ------------------------------ */

/**
 * Markdown-aware chunker. Uses heading lines as hard chunk boundaries so
 * a §4.1 section never bleeds into §4.2. Each chunk carries a
 * `contextualPrefix` equal to the heading path ("4. Access Control > 4.1
 * Identity and Authentication") — this is what Phase 3's LLM
 * contextualizer extends with its own summary.
 *
 * Why this matters for policy docs:
 *   - Dense reference docs (security, HR, compliance) pack one fact per
 *     subsection. Merging sections blurs the signal the retriever needs.
 *   - Headings carry topic labels that aren't repeated in the body
 *     ("4.1 Identity and Authentication" doesn't need to also repeat the
 *     word "identity" in every sentence). Preserving the heading path in
 *     the embedding input means queries like "password policy" still
 *     match the §4.1 chunk even when the body only says "14 characters".
 */
interface MarkdownHeader {
  level: number;
  title: string;
  headerStart: number;
  bodyStart: number;
}

interface MarkdownSection extends MarkdownHeader {
  bodyEnd: number;
  parents: string[];
}

function chunkMarkdown(input: ChunkerInput): Chunk[] {
  const headers = parseMarkdownHeaders(input.fullText);
  if (headers.length === 0) return chunkPlainText(input);

  const pageOffsets = buildPageOffsets(input.pages);
  const sections = resolveSectionBounds(headers, input.fullText.length);

  const out: Chunk[] = [];
  let chunkIndex = 0;
  let parentId = crypto.randomUUID();
  let parentChars = 0;

  const emit = (
    chunks: Omit<Chunk, 'chunkIndex' | 'parentSectionId'>[],
  ) => {
    const parentMaxChars = PARENT_SECTION_TOKENS * CHARS_PER_TOKEN;
    for (const c of chunks) {
      if (parentChars > 0 && parentChars + c.text.length > parentMaxChars) {
        parentId = crypto.randomUUID();
        parentChars = 0;
      }
      parentChars += c.text.length;
      out.push({ ...c, chunkIndex: chunkIndex++, parentSectionId: parentId });
    }
  };

  // Preamble (text before the first heading, e.g. doc title block).
  const firstHeader = headers[0];
  if (firstHeader && firstHeader.headerStart > 0) {
    const preamble = input.fullText.slice(0, firstHeader.headerStart).trim();
    if (preamble.length > 0) {
      emit(chunkTextBlock(preamble, 0, null, pageOffsets));
    }
  }

  for (const section of sections) {
    const body = input.fullText.slice(section.bodyStart, section.bodyEnd).trim();
    if (body.length === 0) continue;
    const headerPath = [...section.parents, section.title].join(' > ');
    emit(chunkTextBlock(body, section.bodyStart, headerPath, pageOffsets));
  }

  return out;
}

function parseMarkdownHeaders(text: string): MarkdownHeader[] {
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  const out: MarkdownHeader[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const hashes = match[1];
    const title = match[2];
    if (!hashes || !title) continue;
    const headerStart = match.index;
    const bodyStart = headerStart + match[0].length;
    out.push({
      level: hashes.length,
      title: title.trim(),
      headerStart,
      bodyStart,
    });
  }
  return out;
}

function resolveSectionBounds(
  headers: MarkdownHeader[],
  docLength: number,
): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    // Body ends at the next header of the same or higher level, else EOF.
    let bodyEnd = docLength;
    for (let j = i + 1; j < headers.length; j++) {
      if (headers[j]!.level <= h.level) {
        bodyEnd = headers[j]!.headerStart;
        break;
      }
    }
    // Ancestors: walking backward, each with strictly smaller level than
    // the previous ancestor (so we don't pick up sibling subsections).
    const ancestors: string[] = [];
    let minLevel = h.level;
    for (let j = i - 1; j >= 0; j--) {
      if (headers[j]!.level < minLevel) {
        ancestors.unshift(headers[j]!.title);
        minLevel = headers[j]!.level;
        if (minLevel === 1) break;
      }
    }
    sections.push({ ...h, bodyEnd, parents: ancestors });
  }
  return sections;
}

function chunkTextBlock(
  blockText: string,
  blockStartInFull: number,
  contextualPrefix: string | null,
  pageOffsets: PageOffset[],
): Omit<Chunk, 'chunkIndex' | 'parentSectionId'>[] {
  const sentences = splitSentences(blockText);
  if (sentences.length === 0) return [];
  const groups = groupIntoChunks(sentences);
  const out: Omit<Chunk, 'chunkIndex' | 'parentSectionId'>[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    const text = group.map((s) => s.text).join(' ');
    const startOffset = blockStartInFull + first.start;
    const endOffset = blockStartInFull + last.end;
    out.push({
      text,
      startOffset,
      endOffset,
      pageNumber: pageForOffset(startOffset, pageOffsets),
      ...(contextualPrefix ? { contextualPrefix } : {}),
    });
  }
  return out;
}
