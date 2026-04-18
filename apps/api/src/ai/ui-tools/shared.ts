import { z } from 'zod';

/**
 * Common Zod primitives used across UI tool input schemas. Kept here so the
 * caps (row counts, label lengths, etc.) are consistent — the model can't
 * blow up the UI by emitting 100k rows or 10kb labels.
 */

export const Label = z.string().min(1).max(120);
export const ShortText = z.string().max(280);
export const LongText = z.string().max(2000);
export const NumericValue = z.number().finite();

export const ChartPoint = z.object({
  label: Label,
  value: NumericValue,
});

export const TableColumn = z.object({
  key: z.string().min(1).max(60),
  header: Label,
  align: z.enum(['left', 'right', 'center']).optional(),
  format: z.enum(['text', 'number', 'currency', 'date']).optional(),
});

export const TableCell = z.union([z.string().max(500), z.number().finite(), z.null()]);

export const ExtractionField = z.object({
  key: z.string().min(1).max(60),
  label: Label,
  type: z.enum(['text', 'number', 'date', 'email', 'url']).default('text'),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  hint: ShortText.optional(),
});

export const ComparisonRow = z.object({
  label: Label,
  value: ShortText,
  /** Optional severity for highlighting — e.g. amounts that differ significantly. */
  emphasis: z.enum(['neutral', 'added', 'removed', 'changed']).optional(),
});

export const ComparisonSide = z.object({
  label: Label,
  subtitle: ShortText.optional(),
  rows: z.array(ComparisonRow).max(50),
});
