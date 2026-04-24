/**
 * Per-model pricing used for cost rollups + spend enforcement.
 *
 * Prices are converted to microdollars at the bottom. Editing a row is the
 * only place pricing changes. Whenever this table is updated, bump
 * `PRICING_VERSION` — every usage row stores the version it was priced
 * under so historical cost is explainable / recomputable.
 *
 * Units:
 *   input / output / cachedInput / reasoning — dollars per 1M tokens.
 *   perRequest — dollars per API request (Cohere rerank, native web search).
 *   perUnit    — dollars per unit (OCR page, etc).
 */

/** Snapshot date for the current price table. Bump when any row changes. */
export const PRICING_VERSION = '2025-04-23';

export interface ModelPriceInput {
  /** Standard input tokens. */
  input?: number;
  /** Output / completion tokens. */
  output?: number;
  /** Cached input tokens (Anthropic explicit cache, OpenAI Responses auto-cache). */
  cachedInput?: number;
  /** Reasoning tokens (o1 / gpt-5 reasoning). Billed as output on most providers. */
  reasoning?: number;
  /** Per-request fee (rerank, native web search). */
  perRequest?: number;
  /** Per-unit fee (OCR per page, etc). */
  perUnit?: number;
}

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number;
  reasoningPerMTok: number;
  perRequestMicrodollars: number;
  perUnitMicrodollars: number;
}

// Source-of-truth pricing table. USD, dollars per million tokens (or per
// request / unit where noted). Reasoning/cached entries default to sane
// fallbacks when not supplied per-row.
const PRICES_USD: Record<string, ModelPriceInput> = {
  // ─── OpenAI chat ───────────────────────────────────────────────────
  // gpt-5 family — cached input priced at 10% of fresh input per OpenAI's
  // published schedule. Reasoning tokens are billed as output on Responses.
  'openai/gpt-5': { input: 2.5, cachedInput: 0.25, output: 10 },
  'openai/gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'openai/gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'openai/gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'openai/gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },

  // OpenAI embeddings (input-only, no output).
  'openai/text-embedding-3-large': { input: 0.13 },
  'openai/text-embedding-3-small': { input: 0.02 },

  // ─── Anthropic ─────────────────────────────────────────────────────
  // Claude prompt-caching: cache reads = 10% of input, cache writes = 125%.
  // We collapse both into cachedInput at the read price for v1 — writes are
  // small and only happen once per prefix, so the error is < ~5%.
  'anthropic/claude-sonnet-4-6': { input: 3, cachedInput: 0.3, output: 15 },
  'anthropic/claude-sonnet-4-5': { input: 3, cachedInput: 0.3, output: 15 },
  'anthropic/claude-haiku-4-5': { input: 1, cachedInput: 0.1, output: 5 },

  // ─── Google ────────────────────────────────────────────────────────
  'google/gemini-2.5-pro': { input: 1.25, output: 10 },
  'google/gemini-2.5-flash': { input: 0.3, output: 2.5 },

  // ─── Voyage embeddings ─────────────────────────────────────────────
  'voyage/voyage-3-large': { input: 0.18 },

  // ─── Cohere rerank ─────────────────────────────────────────────────
  // v3.5 is billed per 1000 searches at $2 → $0.002 per request. A search
  // here means "one rerank call", regardless of document count.
  'cohere/rerank-v3.5': { perRequest: 0.002 },

  // ─── Mistral OCR ───────────────────────────────────────────────────
  // $1 per 1000 pages → $0.001 per page. We pass page count as `units`.
  'mistral/mistral-ocr-latest': { perUnit: 0.001 },
};

export function getPrice(providerSlashModel: string): ModelPrice | null {
  const row = PRICES_USD[providerSlashModel];
  if (!row) return null;
  return {
    inputPerMTok: usdPerMToMicro(row.input ?? 0),
    outputPerMTok: usdPerMToMicro(row.output ?? 0),
    cachedInputPerMTok: usdPerMToMicro(row.cachedInput ?? 0),
    reasoningPerMTok: usdPerMToMicro(row.reasoning ?? row.output ?? 0),
    perRequestMicrodollars: usdToMicro(row.perRequest ?? 0),
    perUnitMicrodollars: usdToMicro(row.perUnit ?? 0),
  };
}

export interface CostInput {
  modelId: string;
  promptTokens?: number;
  cachedInputTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  /** Semantic units (OCR pages, etc). */
  units?: number;
  /** Explicit request count for per-request pricing (rerank). Defaults to 1. */
  requestCount?: number;
}

/**
 * Compute the cost of a call in microdollars, covering every billable
 * dimension the provider exposes. Unknown model → 0 (we still keep the
 * token counts so cost can be backfilled later).
 */
export function computeCostMicrodollars(input: CostInput): number {
  const price = getPrice(input.modelId);
  if (!price) return 0;

  // Cached input tokens are billed at the cached tier; the REMAINING input
  // tokens at the full tier. Providers report inputTokens as the total
  // (OpenAI) or separately (Anthropic) — we normalize to full + cached
  // before arriving here.
  const freshInput = Math.max(0, (input.promptTokens ?? 0));
  const cached = Math.max(0, (input.cachedInputTokens ?? 0));

  // Reasoning tokens are output tokens on most providers; keep their
  // display row separate but bill them at the reasoning rate (which
  // defaults to the output rate when the provider doesn't split them).
  const outputNonReasoning = Math.max(0, (input.completionTokens ?? 0));
  const reasoning = Math.max(0, (input.reasoningTokens ?? 0));

  const units = Math.max(0, (input.units ?? 0));
  const requests = Math.max(0, input.requestCount ?? (price.perRequestMicrodollars > 0 ? 1 : 0));

  const inputCost = (freshInput * price.inputPerMTok) / 1_000_000;
  const cachedCost = (cached * price.cachedInputPerMTok) / 1_000_000;
  const outputCost = (outputNonReasoning * price.outputPerMTok) / 1_000_000;
  const reasoningCost = (reasoning * price.reasoningPerMTok) / 1_000_000;
  const unitCost = units * price.perUnitMicrodollars;
  const requestCost = requests * price.perRequestMicrodollars;

  return Math.round(inputCost + cachedCost + outputCost + reasoningCost + unitCost + requestCost);
}

export function splitProviderModel(id: string): { provider: string; model: string } {
  const [provider, ...rest] = id.split('/');
  return { provider: provider ?? 'unknown', model: rest.join('/') || id };
}

function usdPerMToMicro(usdPerMillion: number): number {
  return Math.round(usdPerMillion * 1_000_000);
}

function usdToMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}
