import { describe, expect, it } from 'vitest';

import { TEST_REDIS_URL } from '../redis/client.js';
import { type Db, TEST_DATABASE_URL } from './client.js';
import {
  assertTestDatabaseUrl,
  assertTestRedisUrl,
  flushTestRedis,
  resetDatabase,
} from './test-helpers.js';

describe('assertTestDatabaseUrl', () => {
  it('refuses a non-test database url', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://user:pass@127.0.0.1:5432/ticketvibe'),
    ).toThrow(/Refusing/);
  });

  it('allows the test database url', () => {
    expect(() => assertTestDatabaseUrl(TEST_DATABASE_URL)).not.toThrow();
  });
});

describe('assertTestRedisUrl', () => {
  it('refuses a redis url without a database index', () => {
    expect(() => assertTestRedisUrl('redis://127.0.0.1:6379')).toThrow(
      /Refusing/,
    );
  });

  it('refuses a redis url pointing at the dev database', () => {
    expect(() => assertTestRedisUrl('redis://127.0.0.1:6379/0')).toThrow(
      /Refusing/,
    );
  });

  it('allows the test redis database url', () => {
    expect(() => assertTestRedisUrl(TEST_REDIS_URL)).not.toThrow();
  });
});

describe('flushTestRedis', () => {
  it('refuses non-test redis urls before connecting', async () => {
    await expect(flushTestRedis('redis://127.0.0.1:6399/0')).rejects.toThrow(
      /Refusing/,
    );
  });
});

describe('resetDatabase', () => {
  it('refuses non-test connection strings', async () => {
    const fakeDb = {
      $client: {
        options: {
          connectionString: 'postgres://user:pass@127.0.0.1:5432/ticketvibe',
        },
      },
    } as unknown as Db;

    await expect(resetDatabase(fakeDb)).rejects.toThrow(/Refusing/);
  });
});
