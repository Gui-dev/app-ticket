import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EventDetailEntity } from '../../events/domain/event-entity.js';
import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { OrderRecord } from '../../orders/domain/order-entity.js';
import type { OrderRepository } from '../../orders/domain/order-repository.js';
import type { EmailMessage } from '../domain/email-sender.js';
import type {
  OrderConfirmationRepository,
  OrderConfirmationState,
} from '../domain/order-confirmation-repository.js';
import { createOrderConfirmationJob } from './order-confirmation.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

const paidOrder: OrderRecord = {
  id: 'order-1',
  userId: 'user-1',
  eventId: 'event-1',
  eventSlug: 'o-fantasma-da-opera',
  status: 'paid',
  paymentMethod: 'card',
  provider: 'fake',
  providerRef: 'pi_1',
  buyerEmail: 'ana@example.com',
  subtotalCents: 12000,
  serviceFeeCents: 1200,
  totalCents: 13200,
  createdAt: NOW,
  paidAt: NOW,
  items: [
    {
      seatId: 'seat-1',
      rowId: 'row-1',
      sectorSlug: 'plateia',
      sectorName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'inteira',
      priceCents: 12000,
    },
  ],
};

const event: EventDetailEntity = {
  id: 'event-1',
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  description: '',
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
  sectors: [],
  artists: [],
};

function setup(
  input: {
    order?: OrderRecord | null;
    event?: EventDetailEntity | null;
    state?: OrderConfirmationState | null;
    sendError?: Error;
    markFailedError?: Error;
  } = {},
) {
  const order = input.order === undefined ? paidOrder : input.order;
  const foundEvent = input.event === undefined ? event : input.event;
  const state = input.state ?? null;

  const findById = vi.fn(async () => order);
  const findBySlug = vi.fn(async () => foundEvent);
  const find = vi.fn(async () => state);
  const markSent = vi.fn(async (_input: { orderId: string; now: Date }) => {});
  const markFailed = vi.fn(
    async (_input: { orderId: string; error: string; now: Date }) => {
      if (input.markFailedError) throw input.markFailedError;
    },
  );
  const send = vi.fn(async (_message: EmailMessage) => {
    if (input.sendError) throw input.sendError;
  });

  const run = createOrderConfirmationJob({
    orders: { findById } as unknown as OrderRepository,
    events: { findBySlug } as unknown as EventsRepository,
    confirmations: {
      find,
      markSent,
      markFailed,
    } as unknown as OrderConfirmationRepository,
    emailSender: { send },
    now: () => NOW,
  });

  return { run, findById, findBySlug, find, markSent, markFailed, send };
}

describe('job de confirmação do pedido', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('envia o e-mail e marca como enviado quando o pedido está pago', async () => {
    const { run, send, markSent, markFailed } = setup();

    await run({ orderId: 'order-1' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'ana@example.com',
      subject: 'Compra confirmada: O Fantasma da Ópera',
    });
    expect(send.mock.calls[0][0].text).toContain('Pedido: order-1');
    expect(markSent).toHaveBeenCalledWith({ orderId: 'order-1', now: NOW });
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('não reenvia quando o e-mail já foi enviado', async () => {
    const { run, send, markSent, markFailed } = setup({
      state: { status: 'sent', sentAt: NOW, lastError: null },
    });

    await run({ orderId: 'order-1' });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marca como falho quando o pedido não está pago', async () => {
    const { run, send, markSent, markFailed } = setup({
      order: { ...paidOrder, status: 'pending' },
    });

    await run({ orderId: 'order-1' });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'order_not_paid',
      now: NOW,
    });
  });

  it('marca como falho quando o pedido não tem e-mail do comprador', async () => {
    const { run, send, markSent, markFailed } = setup({
      order: { ...paidOrder, buyerEmail: null },
    });

    await run({ orderId: 'order-1' });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'missing_buyer_email',
      now: NOW,
    });
  });

  it('marca como falho quando o e-mail do comprador está vazio', async () => {
    const { run, send, markSent, markFailed } = setup({
      order: { ...paidOrder, buyerEmail: '' },
    });

    await run({ orderId: 'order-1' });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'missing_buyer_email',
      now: NOW,
    });
  });

  it('marca como falho e relança quando o envio falha', async () => {
    const { run, send, markSent, markFailed } = setup({
      sendError: new Error('smtp indisponível'),
    });

    await expect(run({ orderId: 'order-1' })).rejects.toThrow(
      'smtp indisponível',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'smtp indisponível',
      now: NOW,
    });
  });

  it('relança o erro de envio quando o registro da falha também falha', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { run, send, markSent, markFailed } = setup({
      sendError: new Error('smtp indisponível'),
      markFailedError: new Error('db indisponível'),
    });

    await expect(run({ orderId: 'order-1' })).rejects.toThrow(
      'smtp indisponível',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'smtp indisponível',
      now: NOW,
    });
    expect(logged).toHaveBeenCalledWith(
      '[worker] email job could not record the send failure',
      expect.any(Error),
    );
  });

  it('apenas avisa e não envia quando o pedido não existe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { run, send, markSent, markFailed } = setup({ order: null });

    await expect(run({ orderId: 'order-1' })).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[worker] email job skipped: order not found',
    );
  });

  it('marca como falho quando o evento não existe', async () => {
    const { run, send, markSent, markFailed } = setup({ event: null });

    await run({ orderId: 'order-1' });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith({
      orderId: 'order-1',
      error: 'event_not_found',
      now: NOW,
    });
  });
});
