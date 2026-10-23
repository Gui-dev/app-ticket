import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from './client.js';
import { promoteOrganizerByEmail } from './promote-organizer.js';
import { user } from './schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from './test-helpers.js';

describe('promoteOrganizerByEmail (postgres integration)', () => {
  let testDb: Db;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
  });

  afterAll(async () => {
    await testDb.$client.end();
  });

  it('promove um usuário existente a organizer', async () => {
    const email = 'promote-existente@test.dev';
    await testDb.insert(user).values({
      id: 'user-promote-existente',
      name: 'Fulano Promovido',
      email,
    });

    const result = await promoteOrganizerByEmail(testDb, email);

    expect(result).toEqual({
      kind: 'promoted',
      userId: 'user-promote-existente',
    });
    const [row] = await testDb.select().from(user).where(eq(user.email, email));
    expect(row?.role).toBe('organizer');
  });

  it('promoção é idempotente', async () => {
    const email = 'promote-idempotente@test.dev';
    await testDb.insert(user).values({
      id: 'user-promote-idempotente',
      name: 'Fulano Idempotente',
      email,
    });

    const first = await promoteOrganizerByEmail(testDb, email);
    const second = await promoteOrganizerByEmail(testDb, email);

    expect(second).toEqual(first);
    const [row] = await testDb.select().from(user).where(eq(user.email, email));
    expect(row?.role).toBe('organizer');
  });

  it('e-mail inexistente devolve not_found', async () => {
    const result = await promoteOrganizerByEmail(
      testDb,
      'promote-inexistente@test.dev',
    );

    expect(result).toEqual({ kind: 'not_found' });
  });
});
