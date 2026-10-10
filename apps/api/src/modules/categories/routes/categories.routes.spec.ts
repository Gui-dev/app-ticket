import { listCategoriesResponseSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { InMemoryEventsRepository } from '../../events/infra/in-memory-events-repository.js';
import { InMemoryCategoriesRepository } from '../infra/in-memory-categories-repository.js';

describe('GET /categories', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      eventsRepository: new InMemoryEventsRepository([]),
      categoriesRepository: new InMemoryCategoriesRepository([
        { slug: 'shows', name: 'Shows' },
        { slug: 'comedy', name: 'Comédia' },
      ]),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns all categories ordered by name', async () => {
    const response = await app.inject({ method: 'GET', url: '/categories' });

    expect(response.statusCode).toBe(200);
    const body = listCategoriesResponseSchema.parse(response.json());
    expect(body.categories.map((category) => category.slug)).toEqual([
      'comedy',
      'shows',
    ]);
  });
});
