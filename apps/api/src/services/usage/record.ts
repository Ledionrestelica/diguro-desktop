import { schema, type Db } from '@diguro/db';
import type { Logger } from '../../lib/logger.ts';
import {
  computeCostMicrodollars,
  PRICING_VERSION,
  splitProviderModel,
} from './pricing.ts';

export type UsageType = typeof schema.usageType.enumValues[number];

export interface RecordUsageInput {
  /** Actor. Never null — every API call is attributable to a user. */
  userId: string;
  /** Workspace scope; null = user-scoped (personal) usage. */
  workspaceId: string | null;
  type: UsageType;
  /** Full "provider/model" slug, e.g. "openai/gpt-5-mini". */
  modelId: string;
  /** Standard input tokens (excluding cached). */
  promptTokens?: number;
  /** Input tokens served from provider cache (cheaper tier). */
  cachedInputTokens?: number;
  /** Output / completion tokens (excluding reasoning where provider splits). */
  completionTokens?: number;
  /** Reasoning tokens for o1 / gpt-5. */
  reasoningTokens?: number;
  /** Semantic units for per-unit billing: OCR pages, etc. */
  units?: number;
  /** Number of billed requests (rerank). Defaults to 1 when the model has
   *  per-request pricing; pass explicitly to override. */
  requestCount?: number;
  /** Provider's own request id. Enables invoice reconciliation. */
  providerRequestId?: string | null;
  /** Wall-clock latency of the provider call, if captured. */
  latencyMs?: number;
  /** Chat context — conversation this call was part of. */
  conversationId?: string | null;
  /** Ingest context — resource version this call was processing. */
  resourceVersionId?: string | null;
}

/**
 * Append a usage row. Fire-and-forget from the caller's perspective — we
 * swallow + log errors so a tracking hiccup never breaks the primary flow.
 * Cost is computed at write time under the active pricing snapshot.
 */
export async function recordUsage(
  deps: { db: Db; logger: Logger },
  input: RecordUsageInput,
): Promise<void> {
  try {
    const { provider, model } = splitProviderModel(input.modelId);
    const cost = computeCostMicrodollars({
      modelId: input.modelId,
      ...(input.promptTokens !== undefined ? { promptTokens: input.promptTokens } : {}),
      ...(input.cachedInputTokens !== undefined
        ? { cachedInputTokens: input.cachedInputTokens }
        : {}),
      ...(input.completionTokens !== undefined
        ? { completionTokens: input.completionTokens }
        : {}),
      ...(input.reasoningTokens !== undefined
        ? { reasoningTokens: input.reasoningTokens }
        : {}),
      ...(input.units !== undefined ? { units: input.units } : {}),
      ...(input.requestCount !== undefined ? { requestCount: input.requestCount } : {}),
    });

    await deps.db.insert(schema.tokenUsage).values({
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      type: input.type,
      provider,
      model,
      promptTokens: input.promptTokens ?? 0,
      cachedInputTokens: input.cachedInputTokens ?? null,
      completionTokens: input.completionTokens ?? 0,
      reasoningTokens: input.reasoningTokens ?? null,
      units: input.units ?? null,
      costMicrodollars: cost,
      pricingVersion: PRICING_VERSION,
      providerRequestId: input.providerRequestId ?? null,
      latencyMs: input.latencyMs ?? null,
      conversationId: input.conversationId ?? null,
      resourceVersionId: input.resourceVersionId ?? null,
    });
  } catch (err) {
    deps.logger.warn('recordUsage failed', {
      modelId: input.modelId,
      type: input.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
