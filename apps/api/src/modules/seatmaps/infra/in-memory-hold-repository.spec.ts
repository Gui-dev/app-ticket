import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { holdSeatKey } from '../domain/hold-entity.js';
import { InMemoryHoldRepository } from './in-memory-hold-repository.js';

describe('InMemoryHoldRepository', () => {
  let nowMs: number;
  let repository: InMemoryHoldRepository;
  const key = holdSeatKey('event-1', 'row-1', 'seat-1');

  beforeEach(() => {
    nowMs = Date.parse('2026-10-16T12:00:00.000Z');
    repository = new InMemoryHoldRepository(() => new Date(nowMs));
  });

  afterEach(() => {
    nowMs = 0;
  });

  it('claims a free seat', async () => {
    expect(await repository.claim(key, 'user-a', 600)).toBe('claimed');
  });

  it('reports held when another user owns the hold', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-b', 600)).toBe('held');
  });

  it('reports owned when the same user claims again', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.claim(key, 'user-a', 600)).toBe('owned');
  });

  it('renews an active hold', async () => {
    await repository.claim(key, 'user-a', 600);
    nowMs += 5 * 60_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
    nowMs += 9 * 60_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(true);
  });

  it('does not renew a foreign or expired hold', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.renew(key, 'user-b', 600)).toBe(false);
    nowMs += 601_000;
    expect(await repository.renew(key, 'user-a', 600)).toBe(false);
  });

  it('releases an owned hold and fails for others', async () => {
    await repository.claim(key, 'user-a', 600);
    expect(await repository.release(key, 'user-b')).toBe(false);
    expect(await repository.release(key, 'user-a')).toBe(true);
    expect(await repository.claim(key, 'user-b', 600)).toBe('claimed');
  });

  it('lets a new claim succeed after ttl expiry', async () => {
    await repository.claim(key, 'user-a', 600);
    nowMs += 601_000;
    expect(await repository.claim(key, 'user-b', 600)).toBe('claimed');
  });
});
