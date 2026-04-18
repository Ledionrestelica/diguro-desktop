/**
 * Re-exports concrete service types from @diguro/trpc. These are the same
 * shapes the tRPC routers return, but resolving them directly avoids the
 * expensive `inferRouterOutputs<AppRouter>` conditional walk that
 * typescript-eslint trips on in practice.
 */
export type {
  ConversationSummary,
  ConversationDetail,
  PersistedMessage,
} from '@diguro/trpc';
