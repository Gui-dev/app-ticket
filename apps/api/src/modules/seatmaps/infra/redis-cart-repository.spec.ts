import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../../../db/test-helpers.js';
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import { cartItemKey } from '../domain/cart-repository.js';
import { RedisCartRepository } from './redis-cart-repository.js';

describe('RedisCartRepository', () => {
  let redis: RedisClient;
  let repository: RedisCartRepository;

  beforeAll(async () => {
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();
    repository = new RedisCartRepository(redis);
  });

  beforeEach(async () => {
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('stores a ticket type under the cart key', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('plateia:A:6')).toBe('meia');
  });

  it('sets a ttl on the cart key', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    const ttl = await redis.ttl('cart:user-a:gig');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('separates carts by user and event', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'vip',
      ttlSeconds: 600,
    });
    expect(
      (await repository.getTypes({ userId: 'user-b', eventSlug: 'gig' })).size,
    ).toBe(0);
    expect(
      (await repository.getTypes({ userId: 'user-a', eventSlug: 'outro' }))
        .size,
    ).toBe(0);
  });

  it('refreshes the ttl on a new write', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const firstTtl = await redis.ttl('cart:user-a:gig');
    expect(firstTtl).toBeGreaterThan(0);
    expect(firstTtl).toBeLessThanOrEqual(600);
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    const secondTtl = await redis.ttl('cart:user-a:gig');
    expect(secondTtl).toBeGreaterThan(0);
    expect(secondTtl).toBeLessThanOrEqual(600);
  });

  it('drops the cart after the ttl expires', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 1,
    });
    await redis.pexpire('cart:user-a:gig', 50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await redis.exists('cart:user-a:gig')).toBe(0);
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.size).toBe(0);
  });

  it('ignores values that are not ticket types', async () => {
    await redis.hset('cart:user-a:gig', 'plateia:A:6', 'leilao');
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.size).toBe(0);
  });
});
