import ExcelJS from 'exceljs';
import type { ExtractedDoc, ExtractorInput } from '../../ports/extractor.ts';
import { sanitizeExtractedText } from './sanitize.ts';

/**
 * XLSX extractor. One "page" per sheet — the markdown-aware chunker picks
 * up the `## Sheet: <name>` headings as a retrieval signal, which lets a
 * query like "2024 budget salaries" land inside the right sheet instead of
 * drowning in every sheet of a 10-tab workbook.
 *
 * Safety caps (MAX_ROWS_PER_SHEET, MAX_COLS) bound runtime + memory on
 * accidentally-huge workbooks. Truncation leaves a visible marker so the
 * chat model can mention it to the user if they ask for data beyond the
 * cutoff.
 */

const MAX_ROWS_PER_SHEET = 2000;
const MAX_COLS = 50;
const MAX_CELL_CHARS = 500;

export async function extractXlsx(input: ExtractorInput): Promise<ExtractedDoc> {
  const wb = new ExcelJS.Workbook();
  // exceljs ships its own legacy `Buffer` type (with a `.resize` method)
  // that doesn't align with Node's actual Buffer shape. At runtime it
  // accepts any Buffer-like bytes, so we narrow through the parameter
  // type to bridge the gap without leaking `any` anywhere else.
  type LoadArg = Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(Buffer.from(input.bytes) as unknown as LoadArg);

  const pages: ExtractedDoc['pages'] = [];
  let pageNumber = 0;

  wb.eachSheet((sheet) => {
    pageNumber += 1;
    const rendered = renderSheet(sheet);
    if (rendered.trim().length === 0) return;
    pages.push({
      pageNumber,
      text: sanitizeExtractedText(rendered),
    });
  });

  return {
    pages,
    fullText: pages.map((p) => p.text).join('\n\n'),
    ocrUsed: false,
    ocrPageCount: 0,
  };
}

function renderSheet(sheet: ExcelJS.Worksheet): string {
  const rowCount = Math.min(sheet.actualRowCount ?? sheet.rowCount, MAX_ROWS_PER_SHEET);
  const colCount = Math.min(sheet.actualColumnCount ?? sheet.columnCount, MAX_COLS);
  if (rowCount <= 0 || colCount <= 0) return '';

  // Collect rows as string arrays first so we can normalize ragged rows
  // into a uniform column count for a valid markdown table.
  const rows: string[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const raw = row.getCell(c).value;
      cells.push(stringifyCell(raw));
    }
    // Skip fully-empty rows so small sheets don't render as acres of `| | |`.
    if (cells.some((v) => v.length > 0)) rows.push(cells);
  }

  if (rows.length === 0) return '';

  const header = [`## Sheet: ${sheet.name}`];
  const tableLines = toMarkdownTable(rows);
  const truncatedNote =
    (sheet.actualRowCount ?? sheet.rowCount) > MAX_ROWS_PER_SHEET
      ? [`_Truncated to first ${MAX_ROWS_PER_SHEET} rows._`]
      : [];

  return [...header, '', ...tableLines, '', ...truncatedNote].join('\n');
}

function toMarkdownTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => escapeCell(r[i] ?? '')).join(' | ')} |`;
  const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const [head, ...body] = rows;
  return [pad(head ?? []), sep, ...body.map(pad)];
}

function escapeCell(value: string): string {
  // Pipe inside a markdown cell breaks the table. Newlines turn into spaces.
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function stringifyCell(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return cap(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // exceljs wraps some cell types (rich text, formulas, hyperlinks,
    // shared strings). Prefer the resolved display values.
    if ('richText' in value && Array.isArray(value.richText)) {
      return cap(value.richText.map((r) => r.text).join(''));
    }
    if ('result' in value && value.result !== undefined) {
      return stringifyCell(value.result as ExcelJS.CellValue);
    }
    if ('text' in value && typeof value.text === 'string') return cap(value.text);
    if ('hyperlink' in value && typeof value.hyperlink === 'string') {
      return cap(value.hyperlink);
    }
    if ('error' in value && typeof value.error === 'string') return value.error;
  }
  return '';
}

function cap(s: string): string {
  if (s.length <= MAX_CELL_CHARS) return s;
  return s.slice(0, MAX_CELL_CHARS) + '…';
}
