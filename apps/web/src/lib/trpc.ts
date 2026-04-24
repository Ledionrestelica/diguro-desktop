import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@diguro/trpc';

/**
 * Shared tRPC React hook factory. Identical signature to the desktop
 * version — every feature component imports `trpc` from `@/lib/trpc`
 * and the alias resolves to whichever app is building.
 */
export const trpc = createTRPCReact<AppRouter>();
