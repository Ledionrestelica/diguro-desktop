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

export const ToolCallPart = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  state: z.enum(['input-streaming', 'input-available', 'output-available', 'output-error']),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
});
export type ToolCallPart = z.infer<typeof ToolCallPart>;

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

export const MessagePart = z.discriminatedUnion('type', [
  TextPart,
  ReasoningPart,
  ToolCallPart,
  CitationRef,
  FilePart,
]);
export type MessagePart = z.infer<typeof MessagePart>;

export const MessageParts = z.array(MessagePart);
export type MessageParts = z.infer<typeof MessageParts>;
