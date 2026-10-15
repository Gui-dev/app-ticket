import { describe, expect, it, vi } from 'vitest';
import type { EventDetailEntity } from '../domain/event-entity';
import { InMemoryEventsRepository } from '../infra/in-memory-events-repository';
import { GetEventDetailUseCase } from './get-event-detail.use-case';

const stubEvents: EventDetailEntity[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'fantasma',
    title: 'O Fantasma da Ópera',
    description: 'Musical internacional no palco do Teatro Renault.',
    categorySlug: 'shows',
    categoryName: 'Shows',
    venueSlug: 'teatro-renault',
    venueName: 'Teatro Renault',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-10-22T23:00:00.000Z'),
    priceFromCents: 12000,
    imageUrl: null,
    badgeLabel: null,
    featured: true,
    isHot: true,
    sectors: [
      {
        slug: 'plateia',
        name: 'Plateia',
        priceFromCents: 12000,
        seatsAvailable: 91,
      },
      {
        slug: 'balcao',
        name: 'Balcão',
        priceFromCents: 19000,
        seatsAvailable: 39,
      },
    ],
    artists: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'standup',
    title: 'Stand-up: Noite de Verdades',
    description: 'Comédia sem filtro no Espaço Unimed.',
    categorySlug: 'comedy',
    categoryName: 'Comédia',
    venueSlug: 'espaco-unimed',
    venueName: 'Espaço Unimed',
    venueCity: 'São Paulo',
    venueState: 'SP',
    startsAt: new Date('2026-11-05T21:00:00.000Z'),
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
    featured: false,
    isHot: true,
    sectors: [
      {
        slug: 'pista',
        name: 'Pista',
        priceFromCents: 9000,
        seatsAvailable: null,
      },
    ],
    artists: [],
  },
];

function createUseCase(
  events: EventDetailEntity[] = stubEvents,
): GetEventDetailUseCase {
  return new GetEventDetailUseCase(new InMemoryEventsRepository(events));
}

describe('GetEventDetailUseCase', () => {
  it('returns the event with its sectors ordered by price', async () => {
    const result = await createUseCase().execute('fantasma');

    expect(result?.slug).toBe('fantasma');
    expect(result?.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
    expect(result?.priceFromCents).toBe(12000);
  });

  it('returns null for an unknown slug', async () => {
    expect(await createUseCase().execute('desconhecido')).toBeNull();
  });

  it('sorts sectors by price even when the source order differs', async () => {
    const unordered: EventDetailEntity[] = [
      {
        ...stubEvents[0],
        sectors: [
          {
            slug: 'balcao',
            name: 'Balcão',
            priceFromCents: 19000,
            seatsAvailable: 39,
          },
          {
            slug: 'plateia',
            name: 'Plateia',
            priceFromCents: 12000,
            seatsAvailable: 91,
          },
        ],
      },
    ];

    const result = await createUseCase(unordered).execute('fantasma');

    expect(result?.sectors.map((sector) => sector.slug)).toEqual([
      'plateia',
      'balcao',
    ]);
  });

  it('breaks price ties on slug ascending', async () => {
    const tied: EventDetailEntity[] = [
      {
        ...stubEvents[0],
        sectors: [
          {
            slug: 'zona-b',
            name: 'Zona B',
            priceFromCents: 15000,
            seatsAvailable: null,
          },
          {
            slug: 'zona-a',
            name: 'Zona A',
            priceFromCents: 15000,
            seatsAvailable: null,
          },
        ],
      },
    ];

    const result = await createUseCase(tied).execute('fantasma');

    expect(result?.sectors.map((sector) => sector.slug)).toEqual([
      'zona-a',
      'zona-b',
    ]);
  });

  it('forwards the slug to the repository', async () => {
    const repository = new InMemoryEventsRepository(stubEvents);
    const findBySlug = vi.spyOn(repository, 'findBySlug');

    await new GetEventDetailUseCase(repository).execute('fantasma');

    expect(findBySlug).toHaveBeenCalledWith('fantasma');
  });
});
