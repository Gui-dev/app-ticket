import type { RedisClient } from '../../../redis/client.js';
import type { HoldClaimResult } from '../domain/hold-entity.js';
import type { HoldRepository } from '../domain/hold-repository.js';

const RENEW_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("EXPIRE", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;

export class RedisHoldRepository implements HoldRepository {
  constructor(private readonly redis: RedisClient) {}

  async claim(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<HoldClaimResult> {
    const result = await this.redis.set(
      seatKey,
      userId,
      'EX',
      ttlSeconds,
      'NX',
    );
    if (result === 'OK') return 'claimed';
    if (await this.renew(seatKey, userId, ttlSeconds)) return 'owned';
    return 'held';
  }

  async renew(
    seatKey: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_SCRIPT,
      1,
      seatKey,
      userId,
      String(ttlSeconds),
    );
    return result === 1;
  }

  async release(seatKey: string, userId: string): Promise<boolean> {
    const result = await this.redis.eval(RELEASE_SCRIPT, 1, seatKey, userId);
    return result === 1;
  }

  async owns(seatKey: string, userId: string): Promise<boolean> {
    return (await this.redis.get(seatKey)) === userId;
  }
}
