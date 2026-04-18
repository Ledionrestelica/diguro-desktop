import { tool } from 'ai';
import { z } from 'zod';
import { Label, LongText, ShortText } from './shared.ts';

const DocumentCardInput = z.object({
  /** Display name of the document — typically the resource filename or title. */
  title: Label,
  /** Optional subtitle, e.g. "Acme Vendor Agreement · 2024-03-15". */
  subtitle: ShortText.optional(),
  /** Short excerpt or summary rendered in the card body. */
  excerpt: LongText.optional(),
  /** Logical resource id (future Resources system). Nullable for v1 where
   *  attachments live outside Resources. */
  resourceId: z.string().max(64).optional(),
  /** Page or section reference to open when clicked. */
  pageNumber: z.number().int().positive().optional(),
  /** Tags surfaced as small badges (e.g. document type, tags extracted at ingest). */
  tags: z.array(z.string().max(40)).max(6).optional(),
});

export type DocumentCardInput = z.infer<typeof DocumentCardInput>;

export const renderDocumentCardTool = tool({
  description: [
    'Render a card previewing a single document or resource with its title,',
    'optional excerpt, and metadata tags. Use when you want to surface a',
    'specific document for the user to open. For multiple documents in a list,',
    'use render_table instead.',
  ].join(' '),
  inputSchema: DocumentCardInput,
  execute: (input) => Promise.resolve(input),
});
