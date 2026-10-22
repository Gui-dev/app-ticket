import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';

export interface FanoutTarget {
  send(text: string): void;
}

export class SeatAvailabilityFanout {
  private readonly rooms = new Map<string, Set<FanoutTarget>>();

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
