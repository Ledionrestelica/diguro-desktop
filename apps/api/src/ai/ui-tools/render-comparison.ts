import { tool } from 'ai';
import { z } from 'zod';
import { ComparisonSide, Label, ShortText } from './shared.ts';

const ComparisonInput = z.object({
  title: Label,
  description: ShortText.optional(),
  left: ComparisonSide,
  right: ComparisonSide,
});

export type ComparisonInput = z.infer<typeof ComparisonInput>;

export const renderComparisonTool = tool({
  description: [
    'Render a two-column comparison between two documents, contracts, options,',
    'or versions. Each side has a label, optional subtitle, and a list of',
    '{ label, value } rows. Use `emphasis` to flag added/removed/changed rows.',
    'For single-column data use render_table.',
  ].join(' '),
  inputSchema: ComparisonInput,
  execute: (input) => Promise.resolve(input),
});
