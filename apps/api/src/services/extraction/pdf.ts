import { extractText } from 'unpdf';
import type { ExtractedDoc, ExtractorInput } from '../../ports/extractor.ts';
import type { OcrProvider } from '../../ports/ocrProvider.ts';
import type { Logger } from '../../lib/logger.ts';
import { sanitizeExtractedText } from './sanitize.ts';

/**
 * PDF extractor. Tries the text layer first (free, fast — unpdf wraps
 * pdfjs). If a page has fewer than OCR_CHAR_THRESHOLD characters after
 * trimming, we treat it as a scanned page and fall back to the OCR provider
 * for the whole document.
 *
 * Why whole-document OCR instead of per-page:
 *   - Mistral OCR charges per page regardless, so no saving.
 *   - Mistral keeps cross-page layout context (headers/footers, table
 *     continuations) which improves quality.
 *   - Simpler control flow — one call either way.
 *
 * If most pages have a text layer but a few don't (rare), we still OCR the
 * whole doc. In exchange for ~$0.01/doc we get consistent markdown output
 * and tables that the chunker can keep intact.
 */

/**
 * Minimum recognizable characters per page for us to trust the text layer.
 * Headers and page numbers alone can produce ~50 chars — set the bar above
 * that.
 */
const OCR_CHAR_THRESHOLD = 100;

/** Fraction of pages that can fall below the threshold before we OCR. */
const OCR_PAGE_FRACTION_THRESHOLD = 0.2;

export interface PdfExtractorDeps {
  ocr: OcrProvider;
  logger: Logger;
}

export async function extractPdf(
  deps: PdfExtractorDeps,
  input: ExtractorInput,
): Promise<ExtractedDoc> {
  // unpdf accepts a Uint8Array of PDF bytes. We pass a copy to defend
  // against underlying buffer reuse (Bun's S3 stream reader can recycle).
  const bytesCopy = new Uint8Array(input.bytes);
  const text = await extractText(bytesCopy).catch((err: unknown) => {
    deps.logger.warn('pdf text-layer extraction failed — will route to OCR', {
      filename: input.filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });

  const pages = text?.text ?? [];
  const totalPages = text?.totalPages ?? 0;
  const sparsePages = pages.filter((p) => p.trim().length < OCR_CHAR_THRESHOLD);
  const sparseFraction = totalPages > 0 ? sparsePages.length / totalPages : 1;

  const needsOcr =
    !text ||
    totalPages === 0 ||
    sparseFraction > OCR_PAGE_FRACTION_THRESHOLD;

  if (!needsOcr) {
    deps.logger.info('pdf text-layer extraction succeeded', {
      filename: input.filename,
      totalPages,
      sparsePages: sparsePages.length,
    });
    const cleanPages = pages.map((t, i) => ({
      pageNumber: i + 1,
      text: sanitizeExtractedText(t),
    }));
    return {
      pages: cleanPages,
      fullText: cleanPages.map((p) => p.text).join('\n\n'),
      ocrUsed: false,
      ocrPageCount: 0,
    };
  }

  deps.logger.info('pdf requires OCR', {
    filename: input.filename,
    totalPages,
    sparsePages: sparsePages.length,
  });

  const ocrResult = await deps.ocr.ocrDocument(
    input.sourceUrl
      ? {
          kind: 'url',
          url: input.sourceUrl,
          filename: input.filename,
          mimeType: input.mimeType,
        }
      : {
          kind: 'bytes',
          bytes: input.bytes,
          filename: input.filename,
          mimeType: input.mimeType,
        },
  );

  const cleanOcrPages = ocrResult.pages.map((p) => ({
    ...p,
    text: sanitizeExtractedText(p.text),
  }));
  return {
    pages: cleanOcrPages,
    fullText: cleanOcrPages.map((p) => p.text).join('\n\n'),
    ocrUsed: true,
    ocrPageCount: cleanOcrPages.length,
  };
}
