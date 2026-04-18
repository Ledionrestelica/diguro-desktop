/**
 * Surface the AppRouter type for the tRPC client + a flat set of concrete
 * type aliases for the common responses. The concrete aliases exist so
 * consumers don't have to walk `inferRouterOutputs<AppRouter>['foo']['bar']`
 * every time — that conditional chain also trips typescript-eslint's
 * type-aware linter in practice.
 */
export type { AppRouter } from '@diguro/api/router';
export type {
  ConversationSummary,
  ConversationDetail,
  PersistedMessage,
} from '@diguro/api/types';
