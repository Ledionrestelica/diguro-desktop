import type { CallUsage } from './usage.ts';

/**
 * OCR provider port. Runs OCR on a document (PDF or image) and returns
 * per-page text. Concrete implementations: Mistral OCR (v1), GPT-5 Vision
 * fallback, self-hosted Olmocr / Docling later.
 *
 * Input: either a remote URL we can hand the provider (preferred — lets the
 * provider fetch directly from S3) or raw bytes + mime type (provider
 * uploads for us).
 *
 * Billing is per-page for Mistral; `usage.units` should be the page count
 * so the cost calculator multiplies by the per-unit rate.
 */
export interface OcrProvider {
  ocrDocument(input: OcrInput): Promise<OcrResult>;
}

export type OcrInput =
  | { kind: 'url'; url: string; filename: string; mimeType: string }
  | { kind: 'bytes'; bytes: Uint8Array; filename: string; mimeType: string };

export interface OcrResult {
  pages: OcrPage[];
  usage: CallUsage;
}

export interface OcrPage {
  pageNumber: number;
  /** Recognized text for this page, ideally as markdown preserving tables. */
  text: string;
}
