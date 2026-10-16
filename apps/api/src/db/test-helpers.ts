import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import { createRedis, TEST_REDIS_URL } from '../redis/client.js';
import { type Db, TEST_DATABASE_URL } from './client.js';

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

export function assertTestDatabaseUrl(url: string): void {
  if (!url.endsWith('/ticketvibe_test')) {
    throw new Error(
      'Refusing to run test helper against non-test database: ' + url,
    );
  }
}

export function assertTestRedisUrl(url: string): void {
  if (new URL(url).pathname !== '/1') {
    throw new Error(
      `Refusing to run test helper against non-test redis database: ${url}`,
    );
  }
}

export async function ensureTestDatabase(
  url = TEST_DATABASE_URL,
): Promise<void> {
  assertTestDatabaseUrl(url);

  const target = new URL(url);
  const databaseName = target.pathname.replace(/^\//, '');

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    const isAlreadyExists =
      error instanceof Error &&
      'code' in error &&
      (error.code === '42P04' || error.code === '23505');
    if (!isAlreadyExists) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

export async function migrateTestDatabase(db: Db): Promise<void> {
  assertTestDatabaseUrl(db.$client.options.connectionString ?? '');

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export async function resetDatabase(db: Db): Promise<void> {
  assertTestDatabaseUrl(db.$client.options.connectionString ?? '');

  await db.execute(
    sql`TRUNCATE TABLE "user", session, account, verification, event_artists, seat_rows, seats, sectors, events, artists, venues, categories RESTART IDENTITY CASCADE`,
  );
}

export async function flushTestRedis(url = TEST_REDIS_URL): Promise<void> {
  assertTestRedisUrl(url);
  const redis = createRedis(url);
  await redis.connect();
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}
