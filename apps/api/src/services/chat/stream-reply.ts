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

/**
 * Normalized usage + response metadata we hand to the cost recorder.
 *
 * Providers and AI-SDK versions label these slightly differently. We
 * accept both `inputTokens`/`outputTokens` (AI-SDK v6) and the older
 * `promptTokens`/`completionTokens` shape, and fold every known cache /
 * reasoning field down to our canonical five.
 *
 * `promptTokens` is the count of FRESH (non-cached) input tokens — if a
 * provider reports total input + separate cached, we subtract so the two
 * don't double-count at the cost layer.
 */
export interface NormalizedUsage {
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface StreamFinishInfo {
  usage: NormalizedUsage;
  providerRequestId: string | null;
  latencyMs: number;
}

export type OnStreamFinish = (info: StreamFinishInfo) => void | Promise<void>;

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
  /** Called once the whole stream (all steps) finishes. Fired server-side,
   *  separate from the UIMessageStreamResponse.onFinish used for persistence. */
  onFinish?: OnStreamFinish;
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
  const startedAt = Date.now();
  return streamText({
    model,
    ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
    messages: modelMessages,
    ...(hasTools ? { tools: input.tools } : {}),
    ...(hasTools ? { stopWhen: stepCountIs(input.maxSteps ?? 2) } : {}),
    experimental_transform: smoothStream({ chunking: 'word' }),
    ...(input.onFinish
      ? {
          onFinish: ({ usage, response }) => {
            const normalized = normalizeUsage(usage);
            const providerRequestId = pickProviderRequestId(response);
            return input.onFinish?.({
              usage: normalized,
              providerRequestId,
              latencyMs: Date.now() - startedAt,
            });
          },
        }
      : {}),
  });
}

/**
 * AI-SDK v6 usage shape, with provider variance folded in:
 *   - inputTokens / outputTokens (v6 canonical)
 *   - promptTokens / completionTokens (legacy)
 *   - cachedInputTokens (Anthropic, OpenAI Responses auto-cache)
 *   - reasoningTokens (o1 / gpt-5)
 *
 * `promptTokens` on OpenAI Responses is the TOTAL input, including cached
 * tokens. Anthropic breaks them out. We always subtract cached from the
 * visible input total so pricing never double-counts. If a provider already
 * reports non-cached input separately we still get the same answer — cached
 * ends up in its own column, fresh input in promptTokens.
 */
function normalizeUsage(usage: unknown): NormalizedUsage {
  if (!usage || typeof usage !== 'object') {
    return { promptTokens: 0, cachedInputTokens: 0, completionTokens: 0, reasoningTokens: 0 };
  }
  const u = usage as Record<string, unknown>;
  const totalInput = numeric(u['inputTokens']) ?? numeric(u['promptTokens']) ?? 0;
  const cached = numeric(u['cachedInputTokens']) ?? numeric(u['cachedPromptTokens']) ?? 0;
  const reasoning = numeric(u['reasoningTokens']) ?? 0;
  const totalOutput = numeric(u['outputTokens']) ?? numeric(u['completionTokens']) ?? 0;

  const freshInput = Math.max(0, totalInput - cached);
  // Reasoning is usually included in totalOutput already (Responses API
  // counts it toward completion). Subtract so rows don't double-count.
  const outputNonReasoning = Math.max(0, totalOutput - reasoning);

  return {
    promptTokens: freshInput,
    cachedInputTokens: cached,
    completionTokens: outputNonReasoning,
    reasoningTokens: reasoning,
  };
}

function pickProviderRequestId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  const id = r['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function numeric(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
