import type { ExtractedDoc, ExtractorInput } from '../../ports/extractor.ts';

/**
 * Passthrough extractor for already-textual formats (MD, TXT, CSV, JSON).
 * We don't split CSV into pages or add any structure — one flat text blob
 * for the chunker to work with. CSVs will end up chunked by the sentence
 * splitter; they won't get row-perfect boundaries but they work.
 */
export function extractText(input: ExtractorInput): ExtractedDoc {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(input.bytes);
  return {
    pages: [],
    fullText: raw,
    ocrUsed: false,
    ocrPageCount: 0,
  };
}
