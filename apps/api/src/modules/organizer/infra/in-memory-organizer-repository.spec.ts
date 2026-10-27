import { describe, expect, it } from 'vitest';

import type {
  InMemoryOrganizerEventSeed,
  InMemoryOrganizerOrderSeed,
  InMemoryOrganizerTicketSeed,
} from './in-memory-organizer-repository';
import { InMemoryOrganizerRepository } from './in-memory-organizer-repository';

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

function createRepository(orders: InMemoryOrganizerOrderSeed[] = []) {
  return new InMemoryOrganizerRepository({
    categories: [{ slug: 'shows', name: 'Shows' }],
    venues: [
      { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
    ],
    events: [seedEvent({ id: 'evt-meu', title: 'Meu Show' })],
    orders,
  });
}

const REPORT_EVENT_ID = 'evt-meu';

describe('InMemoryOrganizerRepository — salesReportForOrganizer', () => {
  it('soma ingressos, bruto, taxa e líquido com pedidos seedados contando a taxa uma vez por pedido', async () => {
    const repository = createRepository([
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T10:00:00.000Z'),
        serviceFeeCents: 500,
        items: [{ priceCents: 5000 }, { priceCents: 3000 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-02T10:00:00.000Z'),
        serviceFeeCents: 100,
        items: [{ priceCents: 1000 }],
      },
    ]);

    const result = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-a',
      from: null,
      to: null,
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: REPORT_EVENT_ID,
        ticketsSold: 3,
        ordersCount: 2,
        grossCents: 9000,
        platformFeeCents: 600,
        netCents: 8400,
      },
    });
  });

  it('pedidos pendentes, falhados e expirados ficam fora do relatório', async () => {
    const repository = createRepository([
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T10:00:00.000Z'),
        serviceFeeCents: 100,
        items: [{ priceCents: 1000 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'pending',
        serviceFeeCents: 900,
        items: [{ priceCents: 9000 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'failed',
        serviceFeeCents: 700,
        items: [{ priceCents: 7000 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'expired',
        serviceFeeCents: 300,
        items: [{ priceCents: 3000 }],
      },
    ]);

    const result = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-a',
      from: null,
      to: null,
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: REPORT_EVENT_ID,
        ticketsSold: 1,
        ordersCount: 1,
        grossCents: 1000,
        platformFeeCents: 100,
        netCents: 900,
      },
    });
  });

  it('fronteira do período é inclusiva no início e exclusiva no fim', async () => {
    const repository = createRepository([
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T09:59:59.000Z'),
        serviceFeeCents: 10,
        items: [{ priceCents: 100 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T10:00:00.000Z'),
        serviceFeeCents: 20,
        items: [{ priceCents: 200 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T11:00:00.000Z'),
        serviceFeeCents: 40,
        items: [{ priceCents: 400 }],
      },
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T11:00:01.000Z'),
        serviceFeeCents: 80,
        items: [{ priceCents: 800 }],
      },
    ]);

    const result = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-a',
      from: new Date('2026-06-01T10:00:00.000Z'),
      to: new Date('2026-06-01T11:00:00.000Z'),
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: REPORT_EVENT_ID,
        ticketsSold: 1,
        ordersCount: 1,
        grossCents: 200,
        platformFeeCents: 20,
        netCents: 180,
      },
    });
  });

  it('evento sem pedidos pagos devolve zeros', async () => {
    const repository = createRepository();

    const result = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-a',
      from: null,
      to: null,
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: REPORT_EVENT_ID,
        ticketsSold: 0,
        ordersCount: 0,
        grossCents: 0,
        platformFeeCents: 0,
        netCents: 0,
      },
    });
  });

  it('seed legado sem campos novos conta como pedido pago com item de preço zero', async () => {
    const repository = createRepository([
      { eventId: REPORT_EVENT_ID, seatIds: ['seat-1'] },
    ]);

    const result = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-a',
      from: null,
      to: null,
    });

    expect(result).toEqual({
      kind: 'ok',
      report: {
        eventId: REPORT_EVENT_ID,
        ticketsSold: 1,
        ordersCount: 1,
        grossCents: 0,
        platformFeeCents: 0,
        netCents: 0,
      },
    });
    expect(
      await repository.deleteEvent({
        eventId: REPORT_EVENT_ID,
        userId: 'user-a',
      }),
    ).toBe('has_orders');
  });

  it('evento inexistente é not_found e evento alheio é forbidden', async () => {
    const repository = createRepository([
      {
        eventId: REPORT_EVENT_ID,
        status: 'paid',
        paidAt: new Date('2026-06-01T10:00:00.000Z'),
        serviceFeeCents: 100,
        items: [{ priceCents: 1000 }],
      },
    ]);

    const missing = await repository.salesReportForOrganizer({
      eventId: 'evt-outro',
      userId: 'user-a',
      from: null,
      to: null,
    });
    expect(missing).toEqual({ kind: 'not_found' });

    const foreign = await repository.salesReportForOrganizer({
      eventId: REPORT_EVENT_ID,
      userId: 'user-b',
      from: null,
      to: null,
    });
    expect(foreign).toEqual({ kind: 'forbidden' });
  });
});

describe('InMemoryOrganizerRepository — validateTicketForOrganizer', () => {
  const MY_EVENT_ID = 'evt-meu';
  const OTHER_EVENT_ID = 'evt-outro';

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

  function seedTicket(
    values: Partial<InMemoryOrganizerTicketSeed> & {
      eventId: string;
      code: string;
    },
  ): InMemoryOrganizerTicketSeed {
    return {
      sectorName: 'Pista',
      rowLabel: 'A',
      seatLabel: '1',
      ...values,
    };
  }

  function createRepository(tickets: InMemoryOrganizerTicketSeed[] = []) {
    return new InMemoryOrganizerRepository({
      categories: [{ slug: 'shows', name: 'Shows' }],
      venues: [
        { slug: 'arena-sp', name: 'Arena SP', city: 'São Paulo', state: 'SP' },
      ],
      events: [
        seedEvent({ id: MY_EVENT_ID, title: 'Meu Show' }),
        seedEvent({ id: OTHER_EVENT_ID, title: 'Outro Show' }),
      ],
      tickets,
    });
  }

  it('ingresso próprio novo é valid com assento e sem metadados de uso', async () => {
    const repository = createRepository([
      seedTicket({ eventId: MY_EVENT_ID, code: 'TKV-1' }),
    ]);

    const result = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-1',
    });

    expect(result).toEqual({
      kind: 'ok',
      record: {
        result: 'valid',
        usedAt: null,
        usedBy: null,
        sectorName: 'Pista',
        rowLabel: 'A',
        seatLabel: '1',
      },
    });
  });

  it('revalidação devolve already_used com horário e quem validou', async () => {
    const repository = createRepository([
      seedTicket({ eventId: MY_EVENT_ID, code: 'TKV-1' }),
    ]);
    await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-1',
    });

    const result = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-1',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.record.result).toBe('already_used');
      expect(result.record.usedAt).toBeInstanceOf(Date);
      expect(result.record.usedBy).toBe('user-a');
      expect(result.record).toMatchObject({
        sectorName: 'Pista',
        rowLabel: 'A',
        seatLabel: '1',
      });
    }
  });

  it('ingresso com uso prévio no seed é already_used com os dados do seed', async () => {
    const usedAt = new Date('2026-06-01T12:00:00.000Z');
    const repository = createRepository([
      seedTicket({
        eventId: MY_EVENT_ID,
        code: 'TKV-2',
        usedAt,
        usedBy: 'Operador',
      }),
    ]);

    const result = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-2',
    });

    expect(result).toEqual({
      kind: 'ok',
      record: {
        result: 'already_used',
        usedAt,
        usedBy: 'Operador',
        sectorName: 'Pista',
        rowLabel: 'A',
        seatLabel: '1',
      },
    });
  });

  it('código desconhecido e ingresso de outro evento são invalid sem marcar', async () => {
    const repository = createRepository([
      seedTicket({ eventId: MY_EVENT_ID, code: 'TKV-1' }),
      seedTicket({ eventId: OTHER_EVENT_ID, code: 'TKV-2' }),
    ]);

    const unknown = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-inexistente',
    });
    expect(unknown).toEqual({ kind: 'invalid' });

    const foreign = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-2',
    });
    expect(foreign).toEqual({ kind: 'invalid' });

    const stillValid = await repository.validateTicketForOrganizer({
      eventId: OTHER_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-2',
    });
    expect(stillValid).toEqual({
      kind: 'ok',
      record: {
        result: 'valid',
        usedAt: null,
        usedBy: null,
        sectorName: 'Pista',
        rowLabel: 'A',
        seatLabel: '1',
      },
    });
  });

  it('evento inexistente é not_found e evento alheio ou da plataforma é forbidden', async () => {
    const repository = createRepository([
      seedTicket({ eventId: MY_EVENT_ID, code: 'TKV-1' }),
    ]);

    const missing = await repository.validateTicketForOrganizer({
      eventId: 'evt-nenhum',
      userId: 'user-a',
      code: 'TKV-1',
    });
    expect(missing).toEqual({ kind: 'not_found' });

    const foreign = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-b',
      code: 'TKV-1',
    });
    expect(foreign).toEqual({ kind: 'forbidden' });

    const unaffected = await repository.validateTicketForOrganizer({
      eventId: MY_EVENT_ID,
      userId: 'user-a',
      code: 'TKV-1',
    });
    expect(unaffected.kind === 'ok' && unaffected.record.result).toBe('valid');
  });
});
