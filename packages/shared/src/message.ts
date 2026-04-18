import { z } from 'zod';
import { ChunkId, ResourceId } from './ids.ts';

/**
 * Discriminated union for Message.parts (stored as jsonb).
 * Validated on every read and write — never trust raw JSON from the DB.
 */

export const TextPart = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextPart = z.infer<typeof TextPart>;

export const ReasoningPart = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
});
export type ReasoningPart = z.infer<typeof ReasoningPart>;

/**
 * AI-SDK v6 emits tool parts with `type: 'tool-<toolName>'` (e.g. `tool-render_chart`).
 * The tool name is derived from the type string rather than carried separately.
 * Because the type is dynamic, this schema is NOT part of the discriminated
 * union — it's validated via `z.union([...])` below.
 */
export const ToolPart = z.object({
  type: z
    .string()
    .refine((s) => s.startsWith('tool-') && s.length > 5, 'must be tool-<name>'),
  toolCallId: z.string(),
  state: z.enum(['input-streaming', 'input-available', 'output-available', 'output-error']),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
});
export type ToolPart = z.infer<typeof ToolPart>;

export function toolPartName(part: ToolPart): string {
  return part.type.slice('tool-'.length);
}

export const CitationRef = z.object({
  type: z.literal('citation'),
  chunkId: ChunkId,
  resourceId: ResourceId,
  rank: z.number().int().nonnegative(),
});
export type CitationRef = z.infer<typeof CitationRef>;

/**
 * File attachment part. `url` can be a data: URL (MVP path — bytes inlined in
 * the message) or, once the Resources system lands, an S3 key that the server
 * resolves to a presigned URL before sending to the model.
 */
export const FilePart = z.object({
  type: z.literal('file'),
  mediaType: z.string().min(1),
  url: z.string().min(1),
  filename: z.string().optional(),
});
export type FilePart = z.infer<typeof FilePart>;

/**
 * External source URL surfaced by provider tools (e.g. OpenAI web_search).
 * Persisted alongside assistant text so sources are visible on reload.
 */
export const SourceUrlPart = z.object({
  type: z.literal('source-url'),
  sourceId: z.string(),
  url: z.string().min(1),
  title: z.string().optional(),
});
export type SourceUrlPart = z.infer<typeof SourceUrlPart>;

/**
 * A message part is one of the static literal-typed variants OR a dynamic
 * `tool-<name>` part. Static variants stay in a discriminated union for fast
 * narrowing; the tool variant is combined via `z.union` since its `type`
 * string is not a literal.
 */
const StaticMessagePart = z.discriminatedUnion('type', [
  TextPart,
  ReasoningPart,
  CitationRef,
  FilePart,
  SourceUrlPart,
]);

export const MessagePart = z.union([StaticMessagePart, ToolPart]);
export type MessagePart = z.infer<typeof MessagePart>;

export const MessageParts = z.array(MessagePart);
export type MessageParts = z.infer<typeof MessageParts>;
