import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../../../db/test-helpers.js';
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import { holdSeatKey } from '../domain/hold-entity.js';
import { RedisHoldRepository } from './redis-hold-repository.js';

describe('RedisHoldRepository (redis integration)', () => {
  let redis: RedisClient;
  let repository: RedisHoldRepository;
  const key = holdSeatKey('event-1', 'row-1', 'seat-1');

  beforeAll(async () => {
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();
    repository = new RedisHoldRepository(redis);
  });

  beforeEach(async () => {
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('claims with NX semantics', async () => {
    expect(await repository.claim(key, 'user-a', 600)).toBe('claimed');
    expect(await redis.get(key)).toBe('user-a');
    expect(await redis.ttl(key)).toBeGreaterThan(590);
  });

  it('keeps the hold for the winner and reports held for others', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-b', 600)).toBe('held');
    expect(await redis.get(key)).toBe('user-a');
  });

  it('reports owned for the same user and renews the ttl', async () => {
    await repository.claim(key, 'user-a', 10);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await repository.claim(key, 'user-a', 600)).toBe('owned');
    expect(await redis.ttl(key)).toBeGreaterThan(590);
  });

  it('renews only for the owner', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.renew(key, 'user-b', 600)).toBe(false);
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
  });

  it('releases only for the owner', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.release(key, 'user-b')).toBe(false);
    expect(await repository.release(key, 'user-a')).toBe(true);
    expect(await redis.get(key)).toBeNull();
  });
});
