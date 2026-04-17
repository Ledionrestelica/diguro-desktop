import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel, ToolSet } from 'ai';
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
  /**
   * Return the set of native tools (provider-side, billed by the provider)
   * enabled for this model. Empty when the model's provider doesn't support
   * the tools we've opted in to.
   */
  nativeTools(modelId: string, opts?: NativeToolOptions): ToolSet | undefined;
}

export interface NativeToolOptions {
  /** Toggle built-in web search. Tightly bounded to keep cost low. */
  webSearch?: boolean;
}

export function createModelRegistry(config: Config): ModelRegistry {
  const providers: Partial<Record<Provider, (model: string) => LanguageModel>> = {};
  let openaiInstance: ReturnType<typeof createOpenAI> | undefined;

  if (config.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
    providers.anthropic = (m) => anthropic(m);
  }
  if (config.OPENAI_API_KEY) {
    openaiInstance = createOpenAI({ apiKey: config.OPENAI_API_KEY });
    const openai = openaiInstance;
    // Force Responses API — webSearchPreview only works through /v1/responses,
    // not /v1/chat/completions. Default .languageModel() already routes there
    // for gpt-5-*, but calling .responses() makes the contract explicit.
    providers.openai = (m) => openai.responses(m);
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

    nativeTools(modelId, opts): ToolSet | undefined {
      if (!opts?.webSearch) return undefined;
      const [providerName] = modelId.split('/');
      if (providerName === 'openai' && openaiInstance) {
        // Low context size => fewer snippet tokens pulled into the prompt.
        // gpt-5-mini uses the Responses API, so webSearchPreview applies.
        return {
          web_search: openaiInstance.tools.webSearchPreview({
            searchContextSize: 'low',
          }),
        };
      }
      // Anthropic / Google web-search hookups can be added here later.
      return undefined;
    },
  };
}
