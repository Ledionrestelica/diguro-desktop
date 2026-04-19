/**
 * Strip control characters that Postgres's `text` type rejects or that
 * break tokenizers downstream. NUL bytes (U+0000) are the main culprit —
 * some PDF text-layer extractions and OCR outputs sprinkle them in. The
 * `text` type throws 22021 (`invalid byte sequence for encoding UTF8`)
 * the moment a NUL byte hits the wire.
 *
 * We keep the standard whitespace controls (\t, \n, \r) and everything
 * above U+001F. U+FFFD (replacement char) is kept intact — if an OCR
 * model emitted it, it's signal about the source quality.
 */

// U+0000-0008, U+000B, U+000C, U+000E-001F — all C0 controls except
// tab/newline/carriage-return. Intentionally matching control chars.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function sanitizeExtractedText(input: string): string {
  if (!input) return input;
  return input.replace(CONTROL_CHARS, '');
}
