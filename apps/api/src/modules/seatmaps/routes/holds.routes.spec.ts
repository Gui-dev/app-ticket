import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';
import type { GetSessionFn } from '../../auth/get-session.js';
import type { HoldSeatUseCase } from '../use-cases/hold-seat.use-case.js';
import type { ReleaseHoldUseCase } from '../use-cases/release-hold.use-case.js';

const holdSeat = {
  execute: vi.fn(),
} as unknown as HoldSeatUseCase;
const releaseHold = {
  execute: vi.fn(),
} as unknown as ReleaseHoldUseCase;

const heldResponse = {
  kind: 'held' as const,
  renewed: false,
  hold: {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    expiresAt: new Date('2026-10-16T12:10:00.000Z'),
  },
};

function buildTestApp(getSession: GetSessionFn) {
  return buildApp({
    holdSeat,
    releaseHold,
    getSession,
  });
}

describe('hold routes (unit)', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without a session', async () => {
    const app = buildTestApp(async () => null);
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
    expect(holdSeat.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 on invalid body', async () => {
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: '', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_body');
    await app.close();
  });

  it('returns 201 with the hold', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce(heldResponse);
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(201);
    expect(holdSeat.execute).toHaveBeenCalledWith({
      userId: 'user-a',
      eventSlug: 'o-fantasma-da-opera',
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
    });
    await app.close();
  });

  it('maps 409 seat_held and 404 kinds', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce({ kind: 'seat_held' });
    const app = buildTestApp(async () => ({ userId: 'user-b', role: 'buyer' }));
    const held = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(held.statusCode).toBe(409);
    expect(held.json()).toEqual({ error: 'seat_held' });
    await app.close();
  });

  it('maps cart_limit to 409', async () => {
    vi.mocked(holdSeat.execute).mockResolvedValueOnce({ kind: 'cart_limit' });
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cart_limit' });
    await app.close();
  });

  it('releases with 200 and 404s hold_not_found', async () => {
    vi.mocked(releaseHold.execute).mockResolvedValueOnce({ kind: 'released' });
    const app = buildTestApp(async () => ({ userId: 'user-a', role: 'buyer' }));
    const released = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(released.statusCode).toBe(200);
    expect(released.json()).toEqual({ released: true });

    vi.mocked(releaseHold.execute).mockResolvedValueOnce({
      kind: 'hold_not_found',
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/holds/release',
      payload: { sectorSlug: 'plateia', rowLabel: 'A', seatLabel: '6' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'hold_not_found' });
    await app.close();
  });
});
