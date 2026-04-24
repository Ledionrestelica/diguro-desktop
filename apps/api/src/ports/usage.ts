/**
 * Shared usage shape returned by every instrumented port call. Callers
 * hand this straight to `recordUsage()` along with their scope context
 * (userId, workspaceId, conversationId, resourceVersionId).
 *
 * Every field is optional — providers that don't report a dimension omit
 * it, and the cost calculator treats omitted fields as zero. `modelId` is
 * the only always-populated field because cost pricing keys off it.
 */
export interface CallUsage {
  /** "provider/model" slug — e.g. "openai/text-embedding-3-large". */
  modelId: string;
  promptTokens?: number;
  cachedInputTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  /** Semantic units for per-unit billing (OCR pages). */
  units?: number;
  /** Explicit request count for per-request pricing (rerank). */
  requestCount?: number;
  providerRequestId?: string | null;
  latencyMs?: number;
}
