import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@diguro/trpc';

export const trpc = createTRPCReact<AppRouter>();
