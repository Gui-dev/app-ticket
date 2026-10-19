import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { flushTestRedis } from '../../db/test-helpers.js';
import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../redis/client.js';
import { migrateAnonymousRedisData } from './migrate-anonymous-data.js';

describe('migrateAnonymousRedisData', () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = createRedis(TEST_REDIS_URL);
    await redis.connect();
  });

  beforeEach(async () => {
    await flushTestRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('reatribui o hold do usuário anônimo preservando o TTL', async () => {
    await redis.set('hold:seat:ev1:row1:seat1', 'anon-1', 'EX', 600);
    await redis.set('hold:seat:ev1:row1:seat2', 'other-user', 'EX', 600);

    await migrateAnonymousRedisData(redis, 'anon-1', 'user-9');

    expect(await redis.get('hold:seat:ev1:row1:seat1')).toBe('user-9');
    expect(await redis.get('hold:seat:ev1:row1:seat2')).toBe('other-user');
    const ttl = await redis.ttl('hold:seat:ev1:row1:seat1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('renomeia o hash do carrinho preservando o TTL', async () => {
    await redis.hset('cart:anon-1:o-fantasma-da-opera', 'plateia:A:6', 'meia');
    await redis.expire('cart:anon-1:o-fantasma-da-opera', 600);

    await migrateAnonymousRedisData(redis, 'anon-1', 'user-9');

    expect(
      await redis.hget('cart:user-9:o-fantasma-da-opera', 'plateia:A:6'),
    ).toBe('meia');
    expect(await redis.exists('cart:anon-1:o-fantasma-da-opera')).toBe(0);
    const ttl = await redis.ttl('cart:user-9:o-fantasma-da-opera');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('mescla os itens no carrinho já existente do destino sem falhar', async () => {
    await redis.hset('cart:anon-1:o-fantasma-da-opera', 'plateia:A:6', 'meia');
    await redis.expire('cart:anon-1:o-fantasma-da-opera', 600);
    await redis.hset(
      'cart:user-9:o-fantasma-da-opera',
      'plateia:B:7',
      'inteira',
    );
    await redis.expire('cart:user-9:o-fantasma-da-opera', 300);

    await expect(
      migrateAnonymousRedisData(redis, 'anon-1', 'user-9'),
    ).resolves.toBeUndefined();

    const merged = await redis.hgetall('cart:user-9:o-fantasma-da-opera');
    expect(merged).toEqual({
      'plateia:A:6': 'meia',
      'plateia:B:7': 'inteira',
    });
    expect(await redis.exists('cart:anon-1:o-fantasma-da-opera')).toBe(0);
    const ttl = await redis.ttl('cart:user-9:o-fantasma-da-opera');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('não falha quando o usuário anônimo não tem holds nem carrinhos', async () => {
    await redis.set('hold:seat:ev1:row1:seat1', 'other-user', 'EX', 600);

    await expect(
      migrateAnonymousRedisData(redis, 'anon-1', 'user-9'),
    ).resolves.toBeUndefined();

    expect(await redis.get('hold:seat:ev1:row1:seat1')).toBe('other-user');
    expect(await redis.keys('cart:*')).toEqual([]);
  });
});
