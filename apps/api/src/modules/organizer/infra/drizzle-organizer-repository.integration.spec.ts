import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { categories, events, user, venues } from '../../../db/schema.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { DrizzleOrganizerRepository } from './drizzle-organizer-repository.js';

const BASE_INPUT = {
  title: 'Show da Política',
  description: 'Descrição longa o suficiente para o evento fixture.',
  categorySlug: 'shows',
  venueSlug: 'arena-sp',
  startsAt: new Date('2026-12-01T20:00:00.000Z'),
  organizerId: 'user-a',
};

function readBackInput(eventId: string) {
  return {
    eventId,
    userId: 'user-a',
    title: 'Show da Política Renomeado',
    description: 'Descrição remarcada com política nova do evento.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: new Date('2026-12-02T20:00:00.000Z'),
  };
}

function expectOk(result: {
  kind: string;
  event?: unknown;
}): asserts result is {
  kind: 'ok';
  event: {
    id: string;
    cancellationWindowHours: number;
    refundPercent: number;
  };
} {
  expect(result.kind).toBe('ok');
}

describe('repositório drizzle de organizador (postgres integration)', () => {
  let testDb: Db;
  let repository: DrizzleOrganizerRepository;

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    repository = new DrizzleOrganizerRepository(testDb);
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await testDb
      .insert(user)
      .values([{ id: 'user-a', name: 'User A', email: 'user-a@example.com' }]);
    await testDb.insert(categories).values({ slug: 'shows', name: 'Shows' });
    await testDb.insert(venues).values({
      slug: 'arena-sp',
      name: 'Arena SP',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  afterAll(async () => {
    await resetDatabase(testDb);
    await testDb.$client.end();
  });

  it('política customizada no createEvent é lida de volta e substituída no updateEvent', async () => {
    const created = await repository.createEvent({
      ...BASE_INPUT,
      cancellationWindowHours: 48,
      refundPercent: 70,
    });
    expectOk(created);

    const read = await repository.findEventForOrganizer({
      eventId: created.event.id,
      userId: 'user-a',
    });
    expectOk(read);
    expect(read.event.cancellationWindowHours).toBe(48);
    expect(read.event.refundPercent).toBe(70);

    const updated = await repository.updateEvent({
      ...readBackInput(created.event.id),
      cancellationWindowHours: 12,
      refundPercent: 30,
    });
    expectOk(updated);
    expect(updated.event.cancellationWindowHours).toBe(12);
    expect(updated.event.refundPercent).toBe(30);

    const readAgain = await repository.findEventForOrganizer({
      eventId: created.event.id,
      userId: 'user-a',
    });
    expectOk(readAgain);
    expect(readAgain.event.cancellationWindowHours).toBe(12);
    expect(readAgain.event.refundPercent).toBe(30);

    const [persisted] = await testDb
      .select({
        cancellationWindowHours: events.cancellationWindowHours,
        refundPercent: events.refundPercent,
      })
      .from(events)
      .where(eq(events.id, created.event.id));
    expect(persisted).toEqual({
      cancellationWindowHours: 12,
      refundPercent: 30,
    });
  });

  it('createEvent sem política persiste padrões 24 e 100', async () => {
    const created = await repository.createEvent({ ...BASE_INPUT });
    expectOk(created);
    expect(created.event.cancellationWindowHours).toBe(24);
    expect(created.event.refundPercent).toBe(100);

    const read = await repository.findEventForOrganizer({
      eventId: created.event.id,
      userId: 'user-a',
    });
    expectOk(read);
    expect(read.event.cancellationWindowHours).toBe(24);
    expect(read.event.refundPercent).toBe(100);
  });
});
