/**
 * OCR provider port. Runs OCR on a document (PDF or image) and returns
 * per-page text. Concrete implementations: Mistral OCR (v1), GPT-5 Vision
 * fallback, self-hosted Olmocr / Docling later.
 *
 * Input: either a remote URL we can hand the provider (preferred — lets the
 * provider fetch directly from S3) or raw bytes + mime type (provider
 * uploads for us).
 */
export interface OcrProvider {
  ocrDocument(input: OcrInput): Promise<OcrResult>;
}

export type OcrInput =
  | { kind: 'url'; url: string; filename: string; mimeType: string }
  | { kind: 'bytes'; bytes: Uint8Array; filename: string; mimeType: string };

export interface OcrResult {
  pages: OcrPage[];
  /** Tokens used — for token_usage tracking. Zero if provider doesn't report. */
  usageTokens: number;
}

export interface OcrPage {
  pageNumber: number;
  /** Recognized text for this page, ideally as markdown preserving tables. */
  text: string;
}
