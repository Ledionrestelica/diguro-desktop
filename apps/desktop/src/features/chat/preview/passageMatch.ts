/** Character range to highlight inside one PDF text item. */
export type ItemRanges = Map<number, { start: number; end: number }>;

interface PageWord {
  word: string;
  pieces: { item: number; start: number; end: number }[];
}

const MAX_HIGHLIGHT_WORDS = 8;
const FALLBACK_WORDS = 6;

/**
 * Picks the few words on a PDF page that a cited answer relies on, like a
 * highlighter (Figma "Document preview - Highlight": "Bank Account: 2856
 * 7584"). The cited chunk is located on the page first; inside it, the
 * shortest run of up to eight words that best covers the answer sentence
 * wins, with numbers weighing most. Without a usable answer sentence, the
 * chunk's opening words are marked so the passage can still be found.
 */
export function findHighlight(
  items: readonly string[],
  passage: string,
  answer: string,
): ItemRanges {
  const page = pageWords(items);
  if (page.length === 0) return new Map();
  const region = locatePassage(
    page.map((w) => w.word),
    toWords(passage),
  ) ?? { from: 0, to: page.length - 1 };

  const weights = answerWeights(answer);
  let best: { from: number; to: number; score: number } | null = null;
  for (let i = region.from; i <= region.to; i++) {
    if (!weights.has(page[i]?.word ?? '')) continue;
    const seen = new Set<string>();
    let score = 0;
    for (let j = i; j <= Math.min(region.to, i + MAX_HIGHLIGHT_WORDS - 1); j++) {
      const word = page[j]?.word ?? '';
      const weight = weights.get(word);
      if (weight === undefined) continue;
      if (!seen.has(word)) {
        seen.add(word);
        score += weight;
      }
      const shorter = best && score === best.score && j - i < best.to - best.from;
      if (!best || score > best.score || shorter) best = { from: i, to: j, score };
    }
  }

  const span = best ?? {
    from: region.from,
    to: Math.min(region.to, region.from + FALLBACK_WORDS - 1),
  };
  const ranges: ItemRanges = new Map();
  for (let i = span.from; i <= span.to; i++) {
    for (const piece of page[i]?.pieces ?? []) {
      const prev = ranges.get(piece.item);
      ranges.set(piece.item, {
        start: Math.min(prev?.start ?? piece.start, piece.start),
        end: Math.max(prev?.end ?? piece.end, piece.end),
      });
    }
  }
  return ranges;
}

function pageWords(items: readonly string[]): PageWord[] {
  const words: PageWord[] = [];
  let hyphenated = false;
  items.forEach((str, item) => {
    let first = true;
    for (const m of str.matchAll(/[\p{L}\p{N}]+/gu)) {
      const piece = { item, start: m.index, end: m.index + m[0].length };
      const prev = words[words.length - 1];
      // A word broken across lines ("ac-" / "count") joins back into one.
      if (first && hyphenated && prev) {
        prev.word += m[0].toLowerCase();
        prev.pieces.push(piece);
      } else {
        words.push({ word: m[0].toLowerCase(), pieces: [piece] });
      }
      first = false;
    }
    if (str.trim().length > 0) hyphenated = /\p{L}-\s*$/u.test(str);
  });
  return words;
}

/** Where the cited chunk sits among the page's words, by its edge words. */
function locatePassage(page: string[], passage: string[]): { from: number; to: number } | null {
  if (passage.length === 0) return null;
  const start = findAnchor(page, passage, 'start');
  if (start === null) return null;
  const end = findAnchor(page, passage, 'end', start.pageIndex);
  const to =
    end?.pageIndex ??
    Math.min(page.length - 1, start.pageIndex + passage.length - start.passageIndex - 1);
  return { from: start.pageIndex, to };
}

const ANCHOR_WORDS = 6;

function findAnchor(
  page: string[],
  passage: string[],
  edge: 'start' | 'end',
  from = 0,
): { pageIndex: number; passageIndex: number } | null {
  const size = Math.min(ANCHOR_WORDS, passage.length);
  const step = Math.max(1, Math.floor(size / 2));
  for (let offset = 0; offset + size <= passage.length; offset += step) {
    const at = edge === 'start' ? offset : passage.length - size - offset;
    const found = indexOfSequence(page, passage.slice(at, at + size), from);
    if (found === -1) continue;
    return edge === 'start'
      ? { pageIndex: found, passageIndex: at }
      : { pageIndex: found + size - 1, passageIndex: at + size - 1 };
  }
  return null;
}

function indexOfSequence(haystack: string[], needle: string[], from: number): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const STOPWORDS = new Set(
  'a an and are as at be been by can do does for from has have how in is it its of on or that the their there these this to was were what when where which who will with you your our we i'.split(
    ' ',
  ),
);

/** Answer words worth matching; numbers and long words count for more. */
function answerWeights(answer: string): Map<string, number> {
  const weights = new Map<string, number>();
  for (const word of toWords(answer)) {
    if (STOPWORDS.has(word)) continue;
    const weight = /\d/.test(word) ? 3 : word.length >= 6 ? 1.5 : word.length >= 3 ? 1 : 0;
    if (weight > 0) weights.set(word, weight);
  }
  return weights;
}

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-\s+/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
