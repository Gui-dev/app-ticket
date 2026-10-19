import { describe, expect, it } from 'vitest';

import { decideOrderCapture, orderMatchesItems } from './order-entity.js';

const now = new Date('2026-10-18T12:00:00.000Z');
const reserved = (holdUserId: string, expiresAt: string) => ({
  seatId: 's1',
  status: 'reserved',
  holdUserId,
  holdExpiresAt: new Date(expiresAt),
});

describe('decideOrderCapture', () => {
  it('confirms when every seat is still held by the buyer', () => {
    expect(
      decideOrderCapture(
        { userId: 'u1' },
        [reserved('u1', '2026-10-18T12:05:00.000Z')],
        now,
      ),
    ).toBe('confirm');
  });

  it('loses when a seat expired', () => {
    expect(
      decideOrderCapture(
        { userId: 'u1' },
        [reserved('u1', '2026-10-18T11:59:00.000Z')],
        now,
      ),
    ).toBe('lost');
  });

  it('loses when a seat belongs to another buyer', () => {
    expect(
      decideOrderCapture(
        { userId: 'u1' },
        [reserved('u2', '2026-10-18T12:05:00.000Z')],
        now,
      ),
    ).toBe('lost');
  });

  it('loses when a seat is no longer reserved', () => {
    expect(
      decideOrderCapture(
        { userId: 'u1' },
        [
          {
            seatId: 's1',
            status: 'occupied',
            holdUserId: null,
            holdExpiresAt: null,
          },
        ],
        now,
      ),
    ).toBe('lost');
    expect(
      decideOrderCapture(
        { userId: 'u1' },
        [
          {
            seatId: 's1',
            status: 'available',
            holdUserId: null,
            holdExpiresAt: null,
          },
        ],
        now,
      ),
    ).toBe('lost');
  });

  it('loses when the order has no seats', () => {
    expect(decideOrderCapture({ userId: 'u1' }, [], now)).toBe('lost');
  });
});

const item = (
  seatId: string,
  ticketType: 'meia' | 'inteira' | 'vip',
  priceCents: number,
) => ({
  seatId,
  rowId: 'row-A',
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: seatId,
  ticketType,
  priceCents,
});

describe('orderMatchesItems', () => {
  it('confere quando os itens do pedido são os mesmos do carrinho', () => {
    expect(
      orderMatchesItems(
        {
          items: [
            item('seat-7', 'inteira', 12000),
            item('seat-6', 'meia', 6000),
          ],
        },
        [item('seat-6', 'meia', 6000), item('seat-7', 'inteira', 12000)],
      ),
    ).toBe(true);
  });

  it('confere mesmo quando a ordem dos itens é diferente', () => {
    expect(
      orderMatchesItems({ items: [item('seat-6', 'meia', 6000)] }, [
        item('seat-6', 'meia', 6000),
      ]),
    ).toBe(true);
  });

  it('não confere quando o tipo do ingresso muda', () => {
    expect(
      orderMatchesItems({ items: [item('seat-6', 'meia', 6000)] }, [
        item('seat-6', 'inteira', 12000),
      ]),
    ).toBe(false);
  });

  it('não confere quando o preço muda', () => {
    expect(
      orderMatchesItems({ items: [item('seat-6', 'meia', 6000)] }, [
        item('seat-6', 'meia', 7000),
      ]),
    ).toBe(false);
  });

  it('não confere quando o assento muda', () => {
    expect(
      orderMatchesItems({ items: [item('seat-6', 'meia', 6000)] }, [
        item('seat-7', 'meia', 6000),
      ]),
    ).toBe(false);
  });

  it('não confere quando a quantidade de itens muda', () => {
    expect(
      orderMatchesItems({ items: [item('seat-6', 'meia', 6000)] }, [
        item('seat-6', 'meia', 6000),
        item('seat-7', 'inteira', 12000),
      ]),
    ).toBe(false);
  });
});
