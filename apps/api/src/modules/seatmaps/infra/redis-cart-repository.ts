import { type TicketType, ticketTypeSchema } from '@ticketvibe/shared';

import type { RedisClient } from '../../../redis/client.js';
import type { CartRepository } from '../domain/cart-repository.js';

export class RedisCartRepository implements CartRepository {
  constructor(private readonly redis: RedisClient) {}

  private key(userId: string, eventSlug: string): string {
    return `cart:${userId}:${eventSlug}`;
  }

  async setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void> {
    const key = this.key(input.userId, input.eventSlug);
    await this.redis.hset(key, input.itemKey, input.ticketType);
    await this.redis.expire(key, input.ttlSeconds);
  }

  async getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>> {
    const hash = await this.redis.hgetall(
      this.key(input.userId, input.eventSlug),
    );
    const result = new Map<string, TicketType>();
    for (const [itemKey, value] of Object.entries(hash)) {
      const parsed = ticketTypeSchema.safeParse(value);
      if (parsed.success) {
        result.set(itemKey, parsed.data);
      }
    }
    return result;
  }
}
