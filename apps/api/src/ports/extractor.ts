import type { CallUsage } from './usage.ts';

/**
 * Extractor port. Turns a raw file (bytes + metadata) into structured text
 * that the chunker can work with. Implementations dispatch by mime type:
 * PDF → pdf-parse (with Mistral OCR fallback for scanned pages), DOCX →
 * mammoth, XLSX → xlsx→markdown, MD/TXT → passthrough.
 */
export interface Extractor {
  extract(input: ExtractorInput): Promise<ExtractedDoc>;
}

export interface ExtractorInput {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  /**
   * Presigned S3 URL to the object, if available. OCR providers prefer a
   * URL over bytes since they fetch directly instead of us shipping the
   * file twice.
   */
  sourceUrl?: string | undefined;
}

export interface ExtractedDoc {
  /** Full flattened text of the document, pages separated by two newlines. */
  fullText: string;
  /**
   * Per-page text, ideally as markdown (tables preserved). Empty array for
   * formats without a page concept (MD/TXT/JSON).
   */
  pages: ExtractedPage[];
  /** Whether OCR had to run on any page. */
  ocrUsed: boolean;
  /** Count of pages OCR'd — legacy field retained for logs; prefer `ocrUsage.units`. */
  ocrPageCount: number;
  /** Full OCR CallUsage when OCR ran. Undefined when pure text-layer extraction. */
  ocrUsage?: CallUsage;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}
