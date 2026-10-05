export type BusEvent = 'bug' | 'approve' | 'deny';
type Handler = () => void;

/** Tiny event bus linking UI taps (bug, approve, deny) to the running script. */
export class Bus {
  private handlers = new Map<BusEvent, Set<Handler>>();

  on(event: BusEvent, fn: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return () => this.handlers.get(event)?.delete(fn);
  }

  emit(event: BusEvent): void {
    [...(this.handlers.get(event) ?? [])].forEach(fn => fn());
  }
}
