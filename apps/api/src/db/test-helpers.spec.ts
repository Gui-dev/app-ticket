import { describe, expect, it } from 'vitest';

import { type Db, TEST_DATABASE_URL } from './client.js';
import { assertTestDatabaseUrl, resetDatabase } from './test-helpers.js';

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
