import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import type { GetSessionFn, UserRole } from '../../auth/get-session.js';

describe('organizer routes (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;

  const getSession: GetSessionFn = async (headers) => {
    const userId = headers['x-test-user-id'];
    if (typeof userId !== 'string') return null;
    if (headers['x-test-anonymous'] === 'true') {
      return { userId, email: null, isAnonymous: true, role: 'buyer' };
    }
    const [row] = await testDb
      .select({ email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, userId));
    if (!row) return null;
    return { userId, email: row.email, role: row.role as UserRole };
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);

    app = buildApp({ getSession });
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await testDb.insert(user).values([
      { id: 'user-a', name: 'User A', email: 'user-a@example.com' },
      { id: 'user-b', name: 'User B', email: 'user-b@example.com' },
      {
        id: 'user-anon',
        name: 'Anon',
        email: 'user-anon@example.com',
        isAnonymous: true,
      },
    ]);
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await app.close();
    await testDb.$client.end();
  });

  it('organizador vê a própria sessão', async () => {
    await testDb
      .update(user)
      .set({ role: 'organizer' })
      .where(eq(user.id, 'user-a'));

    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: { 'x-test-user-id': 'user-a' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: 'user-a', email: 'user-a@example.com', role: 'organizer' },
    });
  });

  it('comprador é negado com 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: { 'x-test-user-id': 'user-b' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_organizer' });
  });

  it('sessão anônima é negada com 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
      headers: {
        'x-test-user-id': 'user-anon',
        'x-test-anonymous': 'true',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_organizer' });
  });

  it('sem sessão é 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/organizer/session',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'not_authenticated' });
  });
});
