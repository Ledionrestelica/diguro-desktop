import { z } from 'zod';

/**
 * Environment config. Validated at boot — missing vars fail fast with a
 * helpful error. No silent fallbacks.
 */
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  VOYAGE_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  /** Mistral OCR — used for scanned/image PDFs during ingestion extraction. */
  MISTRAL_API_KEY: z.string().optional(),
  /**
   * Which provider runs the chunk-contextualizer step. OpenAI (GPT-5-nano
   * with automatic prefix caching) is the default; Anthropic (Haiku 4.5
   * with explicit cache_control) is the opt-in alternative when you have
   * Anthropic credits.
   */
  CONTEXTUALIZE_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  /**
   * Which provider runs embeddings. Default is OpenAI (text-embedding-3
   * -large at 1024 dim, uses OPENAI_API_KEY, tier-1 rate limits). Voyage
   * is the opt-in alternative (voyage-3-large, marginally higher retrieval
   * quality, requires VOYAGE_API_KEY with payment on file for sustained
   * workloads). Switching providers requires a re-ingest — vectors from
   * different providers aren't comparable.
   */
  EMBED_PROVIDER: z.enum(['openai', 'voyage']).default('openai'),

  /**
   * Resend transactional email. Optional in dev — when unset the invitation
   * flow still creates invites but can't send email; admin copies the link
   * from the Members page.
   */
  RESEND_API_KEY: z.string().optional(),
  /**
   * From-address for transactional mail. Defaults to our verified Resend
   * domain (`diguro.se`) so deployments don't need to configure it.
   * Override only in dev / test where the verified sender doesn't exist.
   */
  INVITE_EMAIL_FROM: z.string().default('Diguro <invites@diguro.se>'),
  /**
   * Public URL of the web-companion app — used as the base for invite
   * links embedded in email. The web app owns the accept-invite flow
   * (path-based routing, real HTTPS origin), not the desktop app. Dev
   * default is the Vite server on port 5174; prod is a real deployed
   * origin (e.g. https://app.diguro.se).
   *
   * Must be listed in `ALLOWED_ORIGINS` for browser CORS to allow the
   * cookie-session roundtrip from this origin.
   */
  APP_BASE_URL: z.string().url().default('http://localhost:5174'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('✖ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
