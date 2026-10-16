import type { HoldClaimResult } from './hold-entity.js';

export interface HoldRepository {
  claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult>;
  renew(seatKey: string, userId: string, ttlSeconds: number): Promise<boolean>;
  release(seatKey: string, userId: string): Promise<boolean>;
}
