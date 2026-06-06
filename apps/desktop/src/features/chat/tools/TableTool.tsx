import { z } from 'zod';
import { Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolCard, ToolError, ToolSkeleton, type ToolState } from './shared';
import { exportTable, type ExportFormat } from './tableExport';

const TableColumn = z.object({
  key: z.string(),
  header: z.string(),
  align: z.enum(['left', 'right', 'center']).optional(),
  format: z.enum(['text', 'number', 'currency', 'date']).optional(),
});

const TableCellValue = z.union([z.string(), z.number().finite(), z.null()]);

const TableInput = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  columns: z.array(TableColumn).min(1).max(12),
  rows: z.array(z.record(z.string(), TableCellValue)).max(200),
});

export type TableData = z.infer<typeof TableInput>;
export type TableColumnT = z.infer<typeof TableColumn>;

export function TableTool({ input, state }: { input: unknown; state: ToolState }) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <ToolSkeleton eyebrow="Table" />;
  }
  if (state === 'output-error') return <ToolError eyebrow="Table" />;
  const parsed = TableInput.safeParse(input);
  if (!parsed.success) return <ToolError eyebrow="Table" message="Invalid table data." />;

  return <RenderedTable data={parsed.data} />;
}

function RenderedTable({ data }: { data: TableData }) {
  return (
    <ToolCard
      eyebrow="Table"
      {...(data.title ? { title: data.title } : {})}
      {...(data.description ? { description: data.description } : {})}
      actions={data.rows.length > 0 ? <ExportMenu data={data} /> : undefined}
      padded={false}
    >
      <div className="scrollbar-thin max-h-[480px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-zinc-50/90 backdrop-blur">
              {data.columns.map((col) => (
                <TableHead key={col.key} className={alignClass(col, 'header')}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, i) => (
              <TableRow key={i} className="border-zinc-100 hover:bg-zinc-50/60">
                {data.columns.map((col) => (
                  <TableCell key={col.key} className={alignClass(col, 'cell')}>
                    {formatCell(row[col.key], col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data.rows.length === 0 && (
        <p className="px-5 py-6 text-center text-sm text-zinc-500">No rows.</p>
      )}
    </ToolCard>
  );
}

const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'xlsx', label: 'Export to Excel (.xlsx)', icon: FileSpreadsheet },
  { format: 'docx', label: 'Export to Word (.docx)', icon: FileText },
  { format: 'csv', label: 'Export to CSV (.csv)', icon: Table2 },
];

function ExportMenu({ data }: { data: TableData }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
        aria-label="Export table"
      >
        <Download className="size-3.5" />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {EXPORT_OPTIONS.map(({ format, label, icon: Icon }) => (
          <DropdownMenuItem
            key={format}
            onSelect={() => {
              void exportTable(data, format).catch((err) => {
                console.error(`Table export (${format}) failed`, err);
              });
            }}
          >
            <Icon className="size-4 text-zinc-500" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function alignClass(col: TableColumnT, kind: 'header' | 'cell'): string {
  const align =
    col.align ??
    (col.format === 'number' || col.format === 'currency' ? 'right' : 'left');
  const base =
    kind === 'header'
      ? 'h-9 text-xs font-medium text-zinc-500'
      : 'py-2.5 text-sm text-zinc-800';
  if (align === 'right') return `${base} text-right`;
  if (align === 'center') return `${base} text-center`;
  return `${base} text-left`;
}

export function formatCell(value: unknown, col: TableColumnT): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (col.format === 'currency') return formatCurrency(value);
    if (col.format === 'number') return formatNumber(value);
    return value.toString();
  }
  if (typeof value === 'string') {
    if (col.format === 'date') return formatDate(value);
    return value;
  }
  // Zod restricts cells to string | number | null — this branch is
  // unreachable at runtime. Keep it safe rather than risk `[object Object]`.
  return '—';
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCurrency(v: number): string {
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
