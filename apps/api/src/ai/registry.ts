import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Config } from '../config.ts';
import { ModelNotAllowed } from '@diguro/shared/errors';

/**
 * Maps a "provider/model" string to a concrete AI-SDK LanguageModel.
 * Provider instances are created lazily so an unset API key only errors
 * when that provider is actually requested — not at boot.
 */

export const DEFAULT_CHAT_MODEL = 'openai/gpt-5-mini';
export const DEFAULT_REWRITE_MODEL = 'openai/gpt-5-nano';

const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

export interface ModelRegistry {
  resolve(modelId: string): LanguageModel;
}

export function createModelRegistry(config: Config): ModelRegistry {
  const providers: Partial<Record<Provider, (model: string) => LanguageModel>> = {};

  if (config.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
    providers.anthropic = (m) => anthropic(m);
  }
  if (config.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: config.OPENAI_API_KEY });
    providers.openai = (m) => openai(m);
  }
  if (config.GOOGLE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: config.GOOGLE_AI_API_KEY });
    providers.google = (m) => google(m);
  }

  return {
    resolve(modelId: string): LanguageModel {
      const [providerName, ...rest] = modelId.split('/');
      const model = rest.join('/');
      if (!providerName || !model) {
        throw new ModelNotAllowed(modelId);
      }
      if (!SUPPORTED_PROVIDERS.includes(providerName as Provider)) {
        throw new ModelNotAllowed(modelId);
      }
      const factory = providers[providerName as Provider];
      if (!factory) {
        throw new ModelNotAllowed(
          `${modelId} — ${providerName.toUpperCase()}_API_KEY is not configured`,
        );
      }
      return factory(model);
    },
  };
}
