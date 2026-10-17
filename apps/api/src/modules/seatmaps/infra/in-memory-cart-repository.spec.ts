import { beforeEach, describe, expect, it } from 'vitest';

import { cartItemKey } from '../domain/cart-repository.js';
import { InMemoryCartRepository } from './in-memory-cart-repository.js';

describe('InMemoryCartRepository', () => {
  let nowMs: number;
  let repository: InMemoryCartRepository;

  beforeEach(() => {
    nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    repository = new InMemoryCartRepository(() => new Date(nowMs));
  });

  it('builds the item key from the coords', () => {
    expect(cartItemKey('plateia', 'A', '6')).toBe('plateia:A:6');
  });

  it('stores and returns ticket types per user and event', async () => {
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

  it('separates carts by user and by event', async () => {
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

  it('drops types after the ttl', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    nowMs += 601 * 1000;
    expect(
      (await repository.getTypes({ userId: 'user-a', eventSlug: 'gig' })).size,
    ).toBe(0);
  });

  it('extends item expiry when refreshing the ttl', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    await repository.refreshTtl({
      userId: 'user-a',
      eventSlug: 'gig',
      ttlSeconds: 600,
    });
    nowMs += 150 * 1000;
    expect(
      (await repository.getTypes({ userId: 'user-a', eventSlug: 'gig' })).size,
    ).toBe(1);
  });

  it('does not create a cart when refreshing a missing one', async () => {
    await repository.refreshTtl({
      userId: 'user-a',
      eventSlug: 'gig',
      ttlSeconds: 600,
    });
    expect(
      (await repository.getTypes({ userId: 'user-a', eventSlug: 'gig' })).size,
    ).toBe(0);
  });

  it('refreshes the ttl on a new write', async () => {
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'inteira',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    await repository.setType({
      userId: 'user-a',
      eventSlug: 'gig',
      itemKey: cartItemKey('plateia', 'A', '6'),
      ticketType: 'meia',
      ttlSeconds: 600,
    });
    nowMs += 500 * 1000;
    const types = await repository.getTypes({
      userId: 'user-a',
      eventSlug: 'gig',
    });
    expect(types.get('plateia:A:6')).toBe('meia');
  });
});
