import { formatCell, type TableColumnT, type TableData } from './TableTool';

export type ExportFormat = 'csv' | 'xlsx' | 'docx';

/** Resolve a column's horizontal alignment using the same defaults as the UI. */
function columnAlign(col: TableColumnT): 'left' | 'right' | 'center' {
  return (
    col.align ??
    (col.format === 'number' || col.format === 'currency' ? 'right' : 'left')
  );
}

/** Raw value for spreadsheet/CSV cells — numbers stay numeric, null becomes empty. */
function rawValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  return String(value);
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
  return (trimmed || 'table').slice(0, 120);
}

// exceljs and docx are heavy; load them (and file-saver) on demand so they
// stay out of the main chat bundle and only download when a user exports.
async function save(blob: Blob, filename: string): Promise<void> {
  const { saveAs } = await import('file-saver');
  saveAs(blob, filename);
}

export async function exportTable(data: TableData, format: ExportFormat): Promise<void> {
  const base = sanitizeFilename(data.title ?? 'table');
  if (format === 'csv') return exportCsv(data, base);
  if (format === 'xlsx') return exportXlsx(data, base);
  return exportDocx(data, base);
}

function csvField(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv(data: TableData, base: string): Promise<void> {
  const lines = [data.columns.map((c) => csvField(c.header)).join(',')];
  for (const row of data.rows) {
    lines.push(data.columns.map((c) => csvField(rawValue(row[c.key]))).join(','));
  }
  // Prepend a BOM so Excel opens UTF-8 content correctly.
  const blob = new Blob([`﻿${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  await save(blob, `${base}.csv`);
}

async function exportXlsx(data: TableData, base: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Table');

  sheet.columns = data.columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: Math.min(48, Math.max(12, col.header.length + 2)),
  }));

  sheet.getRow(1).font = { bold: true };

  for (const row of data.rows) {
    const record: Record<string, string | number | null> = {};
    for (const col of data.columns) record[col.key] = rawValue(row[col.key]);
    sheet.addRow(record);
  }

  data.columns.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    if (col.format === 'currency') column.numFmt = '$#,##0.00';
    else if (col.format === 'number') column.numFmt = '#,##0.##';
    column.alignment = { horizontal: columnAlign(col) };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  await save(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${base}.xlsx`,
  );
}

async function exportDocx(data: TableData, base: string): Promise<void> {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table: DocxTable,
    TableCell: DocxTableCell,
    TableRow: DocxTableRow,
    TextRun,
    WidthType,
  } = await import('docx');

  const docxAlign = {
    left: AlignmentType.LEFT,
    right: AlignmentType.RIGHT,
    center: AlignmentType.CENTER,
  } as const;

  const cell = (text: string, col: TableColumnT, bold = false) =>
    new DocxTableCell({
      children: [
        new Paragraph({
          alignment: docxAlign[columnAlign(col)],
          children: [new TextRun({ text, bold })],
        }),
      ],
      ...(bold ? { shading: { fill: 'F4F4F5' } } : {}),
    });

  const headerRow = new DocxTableRow({
    tableHeader: true,
    children: data.columns.map((col) => cell(col.header, col, true)),
  });

  const bodyRows = data.rows.map(
    (row) =>
      new DocxTableRow({
        children: data.columns.map((col) => {
          const value = row[col.key];
          const text = value === null || value === undefined ? '' : formatCell(value, col);
          return cell(text, col);
        }),
      }),
  );

  const table = new DocxTable({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof DocxTable>)[] = [];
  if (data.title) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: data.title }));
  }
  if (data.description) {
    children.push(new Paragraph({ text: data.description }));
  }
  children.push(table);

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  await save(blob, `${base}.docx`);
}
