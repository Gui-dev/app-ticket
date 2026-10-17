import type { HoldClaimResult } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';

interface InMemoryHold {
  userId: string;
  expiresAtMs: number;
}

export class InMemoryHoldRepository implements HoldRepository {
  private readonly holds = new Map<string, InMemoryHold>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private activeHold(seatKey: string): InMemoryHold | null {
    const hold = this.holds.get(seatKey);
    if (!hold) return null;
    if (hold.expiresAtMs <= this.now().getTime()) {
      this.holds.delete(seatKey);
      return null;
    }
    return hold;
  }

  async claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult> {
    const hold = this.activeHold(seatKey);
    if (hold) {
      if (hold.userId !== userId) return 'held';
      hold.expiresAtMs = this.now().getTime() + ttlSeconds * 1000;
      return 'owned';
    }
    this.holds.set(seatKey, {
      userId,
      expiresAtMs: this.now().getTime() + ttlSeconds * 1000,
    });
    return 'claimed';
  }

  async renew(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const hold = this.activeHold(seatKey);
    if (!hold || hold.userId !== userId) return false;
    hold.expiresAtMs = this.now().getTime() + ttlSeconds * 1000;
    return true;
  }

  async release(seatKey: string, userId: string): Promise<boolean> {
    const hold = this.activeHold(seatKey);
    if (!hold || hold.userId !== userId) return false;
    this.holds.delete(seatKey);
    return true;
  }

  async owns(seatKey: string, userId: string): Promise<boolean> {
    return this.activeHold(seatKey)?.userId === userId;
  }
}
