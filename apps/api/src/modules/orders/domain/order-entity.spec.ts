import { describe, expect, it } from 'vitest';

import { decideOrderCapture } from './order-entity.js';

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
