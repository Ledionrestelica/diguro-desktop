import { tool } from 'ai';
import { z } from 'zod';
import { Label, ShortText, TableCell, TableColumn } from './shared.ts';

const TableInput = z.object({
  title: Label.optional(),
  description: ShortText.optional(),
  columns: z.array(TableColumn).min(1).max(12),
  rows: z.array(z.record(z.string(), TableCell)).max(200),
});

export type TableInput = z.infer<typeof TableInput>;

export const renderTableTool = tool({
  description: [
    'Render a structured table of data (lists of invoices, line items, extracted',
    'entities, comparisons across many rows).',
    'Each row is a map keyed by column.key. Keep it under 200 rows.',
    'Do not use for free-form prose or single-value answers.',
  ].join(' '),
  inputSchema: TableInput,
  execute: (input) => Promise.resolve(input),
});
