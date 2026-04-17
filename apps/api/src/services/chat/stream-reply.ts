import {
  convertToModelMessages,
  smoothStream,
  streamText,
  type StreamTextResult,
  type UIMessage,
} from 'ai';
import type { ModelRegistry } from '../../ai/registry.ts';

export interface StreamReplyInput {
  modelId: string;
  messages: UIMessage[];
  systemPrompt?: string;
}

/**
 * Build a streaming reply. Returns the AI-SDK streamText result so the caller
 * can convert it to the transport response it needs (UI message stream, data
 * stream, etc.). No HTTP concerns live here.
 */
export async function streamReply(
  deps: { registry: ModelRegistry },
  input: StreamReplyInput,
): Promise<StreamTextResult<Record<string, never>, never>> {
  const model = deps.registry.resolve(input.modelId);
  const modelMessages = await convertToModelMessages(input.messages);
  return streamText({
    model,
    ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
    messages: modelMessages,
    experimental_transform: smoothStream({ chunking: 'word' }),
  });
}
