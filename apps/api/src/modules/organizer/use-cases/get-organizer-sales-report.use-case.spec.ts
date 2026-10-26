import { describe, expect, it } from 'vitest';

import type { InMemoryOrganizerEventSeed } from '../infra/in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from '../infra/in-memory-organizer-repository';
import { GetSalesReportUseCase } from './get-organizer-sales-report.use-case';

function seedEvent(
  values: Partial<InMemoryOrganizerEventSeed> & { title: string },
): InMemoryOrganizerEventSeed {
  return {
    description: 'Descrição suficientemente longa do evento testado.',
    categorySlug: 'shows',
    venueSlug: 'arena-sp',
    startsAt: new Date('2026-12-01T20:00:00.000Z'),
    organizerId: 'user-a',
    ...values,
  };
}

describe('GetSalesReportUseCase', () => {
  it('delega a agregação ao repositório', async () => {
    const repository = new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [seedEvent({ id: 'evt-meu', title: 'Meu Show' })],
      orders: [
        {
          eventId: 'evt-meu',
          status: 'paid',
          paidAt: new Date('2026-06-01T10:00:00.000Z'),
          serviceFeeCents: 500,
          items: [{ priceCents: 5000 }],
        },
      ],
    });
    const useCase = new GetSalesReportUseCase(repository);

    const result = await useCase.execute({
      eventId: 'evt-meu',
      userId: 'user-a',
      from: null,
      to: null,
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: 'evt-meu',
        ticketsSold: 1,
        ordersCount: 1,
        grossCents: 5000,
        platformFeeCents: 500,
        netCents: 4500,
      },
    });
  });
});
