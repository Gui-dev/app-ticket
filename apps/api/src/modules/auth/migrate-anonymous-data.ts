import type { RedisClient } from '../../redis/client.js';

const HOLD_KEY_PATTERN = 'hold:seat:*';
const SCAN_COUNT = 100;

async function moveCartHash(
  redis: RedisClient,
  source: string,
  destination: string,
): Promise<void> {
  if ((await redis.exists(destination)) === 0) {
    await redis.rename(source, destination);
    return;
  }
  const fields = await redis.hgetall(source);
  if (Object.keys(fields).length > 0) {
    await redis.hset(destination, fields);
  }
  await redis.del(source);
}

export async function migrateAnonymousRedisData(
  redis: RedisClient,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      HOLD_KEY_PATTERN,
      'COUNT',
      SCAN_COUNT,
    );
    cursor = next;
    for (const key of keys) {
      if ((await redis.get(key)) === fromUserId) {
        await redis.set(key, toUserId, 'KEEPTTL');
      }
    }
  } while (cursor !== '0');

  const cartPrefix = `cart:${fromUserId}:`;
  const destinationPrefix = `cart:${toUserId}:`;
  cursor = '0';
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${cartPrefix}*`,
      'COUNT',
      SCAN_COUNT,
    );
    cursor = next;
    for (const key of keys) {
      const destination = `${destinationPrefix}${key.slice(cartPrefix.length)}`;
      await moveCartHash(redis, key, destination);
    }
  } while (cursor !== '0');
}
