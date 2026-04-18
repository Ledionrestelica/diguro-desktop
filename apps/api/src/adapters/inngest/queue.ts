import type { Queue, QueueEvent } from '../../ports/queue.ts';
import type { InngestClient } from '../../inngest/client.ts';

/**
 * Thin `Queue` adapter over the Inngest client. Services depend on `Queue`,
 * not on Inngest — swap implementations for tests by providing a fake.
 */
export function createInngestQueueAdapter(client: InngestClient): Queue {
  return {
    async emit<N extends string, D>(event: QueueEvent<N, D>): Promise<void> {
      // Inngest's send accepts a superset of our shape; cast is safe because
      // the client's schema rejects malformed events at runtime.
      await client.send({ name: event.name, data: event.data } as Parameters<
        InngestClient['send']
      >[0]);
    },
  };
}
