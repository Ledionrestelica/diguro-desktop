/**
 * Concrete response types for the tRPC routers. Consumed by the desktop
 * (and future web) client via `@diguro/trpc`. Keep this file free of runtime
 * imports — it should be purely type re-exports.
 */
export type {
  ConversationSummary,
} from '../services/conversations/list.ts';

export type {
  ConversationDetail,
  PersistedMessage,
  MessageCitation,
} from '../services/conversations/get.ts';
