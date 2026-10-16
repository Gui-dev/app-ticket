import Redis from 'ioredis';

export const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379/0';
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';

export function createRedis(
  url = process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
): Redis {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
}

export type RedisClient = ReturnType<typeof createRedis>;
