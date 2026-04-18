/**
 * Event queue port. Services emit typed events; handlers live in the
 * `inngest/functions/` adapter layer. This port is intentionally tiny —
 * services don't know how events are dispatched, retried, or observed.
 */
export interface Queue {
  emit<N extends string, D>(event: QueueEvent<N, D>): Promise<void>;
}

export interface QueueEvent<N extends string = string, D = unknown> {
  name: N;
  data: D;
}
