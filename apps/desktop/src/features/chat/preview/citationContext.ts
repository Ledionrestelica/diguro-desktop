const MARKER_RE = /\[cite:([a-zA-Z0-9-]+)\]/g;
const MAX_CONTEXT_CHARS = 240;

/**
 * The answer sentence each citation backs up, keyed by chunk id: the text
 * just before the citation's first `[cite:chunkId]` marker, back to the
 * previous sentence end. The preview highlights the words it relies on.
 */
export function citationContexts(text: string): Map<string, string> {
  const contexts = new Map<string, string>();
  for (const m of text.matchAll(MARKER_RE)) {
    const id = m[1];
    if (!id || contexts.has(id)) continue;
    const before = text
      .slice(Math.max(0, m.index - MAX_CONTEXT_CHARS), m.index)
      .replace(MARKER_RE, ' ')
      .replace(/[*_`#>]/g, '');
    const sentences = before.split(/(?<=[.!?])\s+|\n+/);
    const sentence = sentences.filter((s) => s.trim().length > 0).pop() ?? before;
    contexts.set(id, sentence.trim());
  }
  return contexts;
}
