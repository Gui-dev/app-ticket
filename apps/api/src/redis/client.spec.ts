import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../db/test-helpers.js';
import { createRedis, TEST_REDIS_URL } from './client.js';

describe('redis client (integration)', () => {
  const redis = createRedis(TEST_REDIS_URL);

  beforeAll(async () => {
    await redis.connect();
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('sets, reads and expires keys on the test database', async () => {
    expect(String(redis.options.db)).toBe('1');
    await redis.set('client-probe', 'ok', 'EX', 60);
    expect(await redis.get('client-probe')).toBe('ok');
    expect(await redis.ttl('client-probe')).toBeGreaterThan(0);
  });
});
