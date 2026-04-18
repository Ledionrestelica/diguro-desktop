import { z } from 'zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToolCard, ToolError, ToolSkeleton, type ToolState } from './shared';

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

type TableData = z.infer<typeof TableInput>;
type TableColumnT = z.infer<typeof TableColumn>;

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

function formatCell(value: unknown, col: TableColumnT): string {
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
