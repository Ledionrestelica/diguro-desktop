import mammoth from 'mammoth';
import type { ExtractedDoc, ExtractorInput } from '../../ports/extractor.ts';
import { sanitizeExtractedText } from './sanitize.ts';

/**
 * DOCX extractor via mammoth. We go through HTML and convert the heading
 * tags to ATX markdown so the markdown-aware chunker picks up the section
 * hierarchy as a retrieval signal. DOCX has no page concept — leave
 * `pages` empty.
 */
export async function extractDocx(input: ExtractorInput): Promise<ExtractedDoc> {
  const buffer = Buffer.from(input.bytes);
  const result = await mammoth.convertToHtml({ buffer });
  const markdown = htmlToMarkdown(result.value);
  return {
    pages: [],
    fullText: sanitizeExtractedText(markdown),
    ocrUsed: false,
    ocrPageCount: 0,
  };
}

/**
 * Minimal HTML → markdown transform tailored to mammoth's output (headings,
 * lists, paragraphs, emphasis, tables). We don't need a general converter —
 * mammoth emits a narrow subset.
 */
function htmlToMarkdown(html: string): string {
  let s = html;
  for (let lvl = 6; lvl >= 1; lvl--) {
    const hash = '#'.repeat(lvl);
    const re = new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)</h${lvl}>`, 'gi');
    s = s.replace(re, (_m, inner: string) => `\n\n${hash} ${stripTags(inner).trim()}\n\n`);
  }
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner: string) => `\n\n${inner}\n\n`);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => `- ${stripTags(inner).trim()}\n`);
  s = s.replace(/<(ul|ol)[^>]*>|<\/(ul|ol)>/gi, '\n');
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, (_m, _t, inner: string) => `**${inner}**`);
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, (_m, _t, inner: string) => `*${inner}*`);
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, inner: string) => tableToMarkdown(inner));
  s = stripTags(s);
  s = decodeEntities(s);
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function tableToMarkdown(inner: string): string {
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(inner))) {
    const cells: string[] = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1] ?? ''))) {
      cells.push(stripTags(cellMatch[1] ?? '').replace(/\s+/g, ' ').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const [header, ...body] = rows;
  return ['', pad(header ?? []), sep, ...body.map(pad), ''].join('\n');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
