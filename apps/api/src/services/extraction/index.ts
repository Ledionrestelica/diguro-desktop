import type { Extractor, ExtractorInput } from '../../ports/extractor.ts';
import type { OcrProvider } from '../../ports/ocrProvider.ts';
import type { Logger } from '../../lib/logger.ts';
import { UnsupportedMimeType } from '@diguro/shared/errors';
import { extractPdf } from './pdf.ts';
import { extractText } from './text.ts';
import { extractDocx } from './docx.ts';
import { extractXlsx } from './xlsx.ts';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Router that picks the right extractor based on MIME type. New format
 * support = one more branch here + its specific extractor file.
 *
 * Supported in v1:
 *   application/pdf                    → pdf.ts (text layer + OCR fallback)
 *   application/vnd.openxmlformats-...  → docx.ts (mammoth → markdown)
 *   application/vnd.openxmlformats-...  → xlsx.ts (exceljs → per-sheet markdown tables)
 *   text/*, application/json           → text.ts (passthrough decode)
 *
 * Legacy .xls / .ppt / .pptx land in a later phase (different parsers).
 * Images route through OCR directly (Phase 1.5).
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
      if (mime === DOCX_MIME) {
        return extractDocx(input);
      }
      if (mime === XLSX_MIME) {
        return extractXlsx(input);
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
export { extractDocx } from './docx.ts';
export { extractXlsx } from './xlsx.ts';
