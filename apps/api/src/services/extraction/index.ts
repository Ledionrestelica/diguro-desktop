import type { Extractor, ExtractorInput } from '../../ports/extractor.ts';
import type { OcrProvider } from '../../ports/ocrProvider.ts';
import type { Logger } from '../../lib/logger.ts';
import { UnsupportedMimeType } from '@diguro/shared/errors';
import { extractPdf } from './pdf.ts';
import { extractText } from './text.ts';

/**
 * Router that picks the right extractor based on MIME type. New format
 * support = one more branch here + its specific extractor file.
 *
 * Supported in v1:
 *   application/pdf                    → pdf.ts (text layer + OCR fallback)
 *   text/*, application/json           → text.ts (passthrough decode)
 *
 * DOCX / XLSX / PPTX land in Phase 1.5 (need mammoth, xlsx, etc.). Images
 * route through OCR directly (Phase 1.5).
 */
export function createExtractor(deps: {
  ocr: OcrProvider;
  logger: Logger;
}): Extractor {
  return {
    async extract(input: ExtractorInput) {
      const mime = input.mimeType.toLowerCase();
      if (mime === 'application/pdf') {
        return extractPdf(deps, input);
      }
      if (
        mime.startsWith('text/') ||
        mime === 'application/json'
      ) {
        return extractText(input);
      }
      throw new UnsupportedMimeType(
        `Extraction for ${mime} not implemented yet`,
      );
    },
  };
}

export { extractPdf } from './pdf.ts';
export { extractText } from './text.ts';
