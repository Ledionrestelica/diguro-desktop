import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  type StreamTextResult,
  type ToolSet,
  type UIMessage,
} from 'ai';
import type { ModelRegistry } from '../../ai/registry.ts';

export interface StreamReplyInput {
  modelId: string;
  messages: UIMessage[];
  systemPrompt?: string;
  /**
   * Provider-native tools (e.g. OpenAI's web_search). When present, `stepCountIs`
   * limits how many tool-call roundtrips the model can take. 2 is enough for
   * a single search + follow-up read; raise to 3-4 only if we see the model
   * truncating research prematurely.
   */
  tools?: ToolSet;
  maxSteps?: number;
}

/**
 * Build a streaming reply. Returns the AI-SDK streamText result so the caller
 * can convert it to the transport response it needs (UI message stream, data
 * stream, etc.). No HTTP concerns live here.
 */
export async function streamReply(
  deps: { registry: ModelRegistry },
  input: StreamReplyInput,
): Promise<StreamTextResult<ToolSet, never>> {
  const model = deps.registry.resolve(input.modelId);
  const modelMessages = await convertToModelMessages(input.messages);
  const hasTools = input.tools && Object.keys(input.tools).length > 0;
  return streamText({
    model,
    ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
    messages: modelMessages,
    ...(hasTools ? { tools: input.tools } : {}),
    ...(hasTools ? { stopWhen: stepCountIs(input.maxSteps ?? 2) } : {}),
    experimental_transform: smoothStream({ chunking: 'word' }),
  });
}
