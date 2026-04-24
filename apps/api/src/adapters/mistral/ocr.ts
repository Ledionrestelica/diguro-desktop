import { z } from 'zod';
import type { OcrInput, OcrProvider, OcrResult } from '../../ports/ocrProvider.ts';

/**
 * Mistral OCR adapter. Purpose-built document OCR — produces per-page
 * markdown preserving tables and structure. ~$1 per 1000 pages on the API
 * as of 2026. Open weights available if we need to self-host for
 * compliance-sensitive customers later.
 *
 * API: POST https://api.mistral.ai/v1/ocr
 *   body: { model, document: { type: 'document_url', document_url: <url|data:> } }
 * Response includes pages[] with markdown text per page.
 */

const MODEL = 'mistral-ocr-latest';
const MODEL_ID = `mistral/${MODEL}`;
const ENDPOINT = 'https://api.mistral.ai/v1/ocr';

const MistralOcrResponse = z.object({
  pages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      markdown: z.string(),
    }),
  ),
  usage_info: z
    .object({
      pages_processed: z.number().int().optional(),
      doc_size_bytes: z.number().int().optional(),
    })
    .optional(),
});

export interface MistralDeps {
  apiKey: string;
}

export function createMistralOcrProvider(deps: MistralDeps): OcrProvider {
  return {
    async ocrDocument(input: OcrInput): Promise<OcrResult> {
      const body = buildBody(input);
      const startedAt = Date.now();
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Mistral OCR ${res.status}: ${text.slice(0, 500)}`);
      }
      const raw: unknown = await res.json();
      const parsed = MistralOcrResponse.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Mistral OCR response shape mismatch: ${parsed.error.message}`);
      }

      const pages = parsed.data.pages.map((p) => ({
        // Mistral returns 0-based; we expose 1-based externally to match
        // what humans expect when clicking citation chips.
        pageNumber: p.index + 1,
        text: p.markdown,
      }));
      const pageCount = parsed.data.usage_info?.pages_processed ?? pages.length;

      return {
        pages,
        usage: {
          modelId: MODEL_ID,
          units: pageCount,
          providerRequestId: res.headers.get('x-request-id'),
          latencyMs: Date.now() - startedAt,
        },
      };
    },
  };
}

function buildBody(input: OcrInput): Record<string, unknown> {
  if (input.kind === 'url') {
    return {
      model: MODEL,
      document: { type: 'document_url', document_url: input.url },
      include_image_base64: false,
    };
  }
  // Fallback: data URL. Base64 inflates payload ~33% but avoids a second
  // S3 roundtrip if we already have bytes. For large files prefer the
  // `url` form with a presigned GET.
  const b64 = bufferToBase64(input.bytes);
  const dataUrl = `data:${input.mimeType};base64,${b64}`;
  return {
    model: MODEL,
    document: { type: 'document_url', document_url: dataUrl },
    include_image_base64: false,
  };
}

function bufferToBase64(bytes: Uint8Array): string {
  // Bun / Node 16+: Buffer.from works on Uint8Array directly.
  // Avoid atob/btoa which are browser-only and encode character-by-character.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Fallback for non-Node runtimes (unlikely here).
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
