import { tool } from 'ai';
import { z } from 'zod';
import { ExtractionField, Label, ShortText } from './shared.ts';

const ExtractionFormInput = z.object({
  title: Label,
  description: ShortText.optional(),
  fields: z.array(ExtractionField).min(1).max(30),
  /** Name of the source document, shown as a small attribution. */
  sourceTitle: ShortText.optional(),
});

export type ExtractionFormInput = z.infer<typeof ExtractionFormInput>;

export const renderExtractionFormTool = tool({
  description: [
    'Render a read-only form of extracted fields from a document (invoice totals,',
    'contract dates, party names, etc.). Each field has a label, type, and the',
    'extracted value. The user sees the fields and can copy them — they do not',
    'submit the form. For a flat list without structure use render_table.',
  ].join(' '),
  inputSchema: ExtractionFormInput,
  execute: (input) => Promise.resolve(input),
});
