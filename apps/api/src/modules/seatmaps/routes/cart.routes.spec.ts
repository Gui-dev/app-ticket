import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import type { GetCartUseCase } from '../use-cases/get-cart.use-case.js';
import type { SetCartItemUseCase } from '../use-cases/set-cart-item.use-case.js';

const getCart = {
  execute: vi.fn(),
} as unknown as GetCartUseCase;
const setCartItem = {
  execute: vi.fn(),
} as unknown as SetCartItemUseCase;

function buildTestApp(getSession: GetSessionFn) {
  return buildApp({ getCart, setCartItem, getSession });
}

const emptyCart = {
  kind: 'cart' as const,
  cart: {
    eventSlug: 'o-fantasma-da-opera',
    items: [],
    expiresAt: null,
    totalCents: 0,
  },
};

describe('cart routes (unit)', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session on GET cart', async () => {
    const app = buildTestApp(async () => null);
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(401);
    expect(getCart.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 with the cart', async () => {
    vi.mocked(getCart.execute).mockResolvedValueOnce(emptyCart);
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(emptyCart.cart);
    expect(getCart.execute).toHaveBeenCalledWith(
      'user-a',
      'o-fantasma-da-opera',
    );
    await app.close();
  });

  it('maps event_not_found to 404 on GET cart', async () => {
    vi.mocked(getCart.execute).mockResolvedValueOnce({
      kind: 'event_not_found',
    });
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'event_not_found' });
    await app.close();
  });

  it('stores a cart item with 200', async () => {
    vi.mocked(setCartItem.execute).mockResolvedValueOnce({
      kind: 'cart_item_set',
      item: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      item: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(setCartItem.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
    });
    await app.close();
  });

  it('returns 401 without a session on PUT', async () => {
    const app = buildTestApp(async () => null);
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      payload: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'meia',
      },
    });
    expect(response.statusCode).toBe(401);
    expect(setCartItem.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps 404 kinds and hold_not_found on PUT', async () => {
    for (const kind of [
      'event_not_found',
      'sector_not_found',
      'seat_not_found',
      'hold_not_found',
    ] as const) {
      vi.mocked(setCartItem.execute).mockResolvedValueOnce({ kind });
      const app = buildTestApp(async () => ({
        userId: 'user-a',
        role: 'buyer',
      }));
      const response = await app.inject({
        method: 'PUT',
        url: '/events/o-fantasma-da-opera/cart/items',
        payload: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'vip',
        },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: kind });
      await app.close();
    }
  });

  it('rejects an invalid body on PUT', async () => {
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'PUT',
      url: '/events/o-fantasma-da-opera/cart/items',
      payload: {
        sectorSlug: '',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'x',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
    expect(setCartItem.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('serializes item dates to iso strings on GET', async () => {
    vi.mocked(getCart.execute).mockResolvedValueOnce({
      kind: 'cart',
      cart: {
        eventSlug: 'o-fantasma-da-opera',
        items: [
          {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel: '6',
            ticketType: 'meia',
            priceCents: 6000,
            expiresAt: new Date('2026-10-16T12:10:00.000Z'),
          },
        ],
        expiresAt: new Date('2026-10-16T12:10:00.000Z'),
        totalCents: 6000,
      },
    });
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'GET',
      url: '/events/o-fantasma-da-opera/cart',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      eventSlug: 'o-fantasma-da-opera',
      items: [
        {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
          priceCents: 6000,
          expiresAt: '2026-10-16T12:10:00.000Z',
        },
      ],
      expiresAt: '2026-10-16T12:10:00.000Z',
      totalCents: 6000,
    });
    expect(getCart.execute).toHaveBeenCalledWith(
      'user-a',
      'o-fantasma-da-opera',
    );
    await app.close();
  });
});
