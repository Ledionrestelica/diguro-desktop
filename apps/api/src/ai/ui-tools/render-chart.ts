import { tool } from 'ai';
import { z } from 'zod';
import { ChartPoint, Label, ShortText } from './shared.ts';

const ChartInput = z.object({
  kind: z.enum(['bar', 'line', 'pie', 'area']),
  title: Label,
  description: ShortText.optional(),
  xLabel: Label.optional(),
  yLabel: Label.optional(),
  series: z.array(ChartPoint).min(1).max(50),
  /** Optional currency symbol for value formatting (e.g. "$", "€"). */
  currency: z.string().max(3).optional(),
});

export type ChartInput = z.infer<typeof ChartInput>;

export const renderChartTool = tool({
  description: [
    'Render a chart from numerical data extracted from documents or a conversation.',
    'Use for: totals over time, distributions, comparisons across categories.',
    'Do not use for textual data or when fewer than 3 data points are available.',
  ].join(' '),
  inputSchema: ChartInput,
  execute: (input) => Promise.resolve(input),
});
