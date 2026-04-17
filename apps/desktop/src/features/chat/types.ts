import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@diguro/trpc';

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ConversationSummary = RouterOutputs['conversations']['list'][number];
export type ConversationDetail = RouterOutputs['conversations']['get'];
export type PersistedMessage = ConversationDetail['messages'][number];
