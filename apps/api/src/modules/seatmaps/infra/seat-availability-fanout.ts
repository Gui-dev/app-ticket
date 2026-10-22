import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';

export interface FanoutTarget {
  send(text: string): void;
  ping(): void;
  terminate(): void;
}

export class SeatAvailabilityFanout {
  private readonly rooms = new Map<string, Set<FanoutTarget>>();
  private readonly awaitingPong = new WeakSet<FanoutTarget>();

  register(eventSlug: string, target: FanoutTarget): () => void {
    const targets = this.rooms.get(eventSlug) ?? new Set();
    targets.add(target);
    this.rooms.set(eventSlug, targets);
    return () => {
      const current = this.rooms.get(eventSlug);
      if (!current) return;
      current.delete(target);
      if (current.size === 0) this.rooms.delete(eventSlug);
    };
  }

  markAlive(target: FanoutTarget): void {
    this.awaitingPong.delete(target);
  }

  sweep(): void {
    for (const [eventSlug, targets] of [...this.rooms]) {
      for (const target of [...targets]) {
        if (this.awaitingPong.has(target)) {
          targets.delete(target);
          target.terminate();
        } else {
          this.awaitingPong.add(target);
          target.ping();
        }
      }
      if (targets.size === 0) this.rooms.delete(eventSlug);
    }
  }

  terminateAll(): void {
    for (const [eventSlug, targets] of [...this.rooms]) {
      for (const target of [...targets]) {
        targets.delete(target);
        target.terminate();
      }
      this.rooms.delete(eventSlug);
    }
  }

  fanout(text: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = seatAvailabilityMessageSchema.safeParse(payload);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type !== 'seat_status_changed') return;
    const targets = this.rooms.get(message.eventSlug);
    if (!targets) return;
    for (const target of [...targets]) {
      try {
        target.send(text);
      } catch {
        targets.delete(target);
        if (targets.size === 0) this.rooms.delete(message.eventSlug);
      }
    }
  }
}
