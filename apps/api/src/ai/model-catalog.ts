import type { Config } from '../config.ts';

/**
 * Curated list of chat models a user may pick from. Kept small + opinionated:
 * a Haiku-class fast model, a Sonnet-class balanced model, and a flagship
 * per provider. Adding a row here is the only change needed to make a new
 * model selectable by users.
 *
 * `tier` captures our rough price tier at a glance so the UI can render a
 * badge without parsing pricing:
 *   - fast    — cheap + fast (Haiku, gpt-5-mini, flash)
 *   - balanced— daily driver (Sonnet, gpt-5, pro)
 *   - heavy   — max reasoning (opus, gpt-5 + high reasoning)
 *
 * `defaultForSelect` is the default when a user has no preference set.
 * Exactly one entry should be marked as default per session.
 */

export type ChatModelTier = 'fast' | 'balanced' | 'heavy';

export interface ChatModelCard {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'google';
  tier: ChatModelTier;
  description: string;
  defaultForSelect?: boolean;
}

const CATALOG: ChatModelCard[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────
  {
    id: 'openai/gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'openai',
    tier: 'fast',
    description: 'Fast + cheap. Good default for everyday chat.',
    defaultForSelect: true,
  },
  {
    id: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'openai',
    tier: 'balanced',
    description: 'Flagship reasoning. Best for complex questions.',
  },
  {
    id: 'openai/gpt-5-nano',
    label: 'GPT-5 nano',
    provider: 'openai',
    tier: 'fast',
    description: 'Cheapest OpenAI tier. Great for simple tasks.',
  },

  // ── Anthropic ───────────────────────────────────────────────────────
  {
    id: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    tier: 'balanced',
    description: 'Strong across the board, especially long-form writing.',
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'fast',
    description: 'Fastest Claude. Excellent for quick answers.',
  },

  // ── Google ──────────────────────────────────────────────────────────
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    tier: 'balanced',
    description: 'Long-context Google model. Good at technical content.',
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    tier: 'fast',
    description: 'Cheapest Google tier. Fast for simple chats.',
  },
];

/**
 * Filter the catalog to only models the server can actually resolve —
 * a model whose provider key isn't configured would throw on first call.
 * Also respects a per-user/org allow-list when one is supplied.
 */
export function listAvailableModels(
  config: Config,
  opts?: { allowedIds?: readonly string[] | null },
): ChatModelCard[] {
  const allowed = opts?.allowedIds && opts.allowedIds.length > 0
    ? new Set(opts.allowedIds)
    : null;

  return CATALOG.filter((m) => {
    if (allowed && !allowed.has(m.id)) return false;
    switch (m.provider) {
      case 'anthropic':
        return Boolean(config.ANTHROPIC_API_KEY);
      case 'openai':
        return Boolean(config.OPENAI_API_KEY);
      case 'google':
        return Boolean(config.GOOGLE_AI_API_KEY);
    }
  });
}

/**
 * Resolve the effective default model for a user, following the CLAUDE.md
 * precedence: user preference → org default → first available catalog entry.
 * Returns null only when no models are configured at all.
 */
export function resolveDefaultModel(
  config: Config,
  opts: {
    userPreferredId: string | null;
    orgDefaultId?: string | null;
    allowedIds?: readonly string[] | null;
  },
): ChatModelCard | null {
  const available = listAvailableModels(config, { allowedIds: opts.allowedIds ?? null });
  if (available.length === 0) return null;

  const byId = new Map(available.map((m) => [m.id, m]));
  if (opts.userPreferredId && byId.has(opts.userPreferredId)) {
    return byId.get(opts.userPreferredId) ?? null;
  }
  if (opts.orgDefaultId && byId.has(opts.orgDefaultId)) {
    return byId.get(opts.orgDefaultId) ?? null;
  }
  const preferred = available.find((m) => m.defaultForSelect);
  return preferred ?? available[0] ?? null;
}

export function isKnownChatModel(id: string): boolean {
  return CATALOG.some((m) => m.id === id);
}
