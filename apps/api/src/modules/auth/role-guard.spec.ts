import { describe, expect, it } from 'vitest';

import { guardOrganizer } from './role-guard.js';

describe('guardOrganizer', () => {
  it('sessão nula resulta em not_authenticated', () => {
    expect(guardOrganizer(null)).toEqual({ kind: 'not_authenticated' });
  });

  it('sessão anônima com papel buyer resulta em not_organizer', () => {
    expect(
      guardOrganizer({ userId: 'user-a', isAnonymous: true, role: 'buyer' }),
    ).toEqual({ kind: 'not_organizer' });
  });

  it('sessão com papel buyer resulta em not_organizer', () => {
    expect(guardOrganizer({ userId: 'user-a', role: 'buyer' })).toEqual({
      kind: 'not_organizer',
    });
  });

  it('sessão com papel organizer resulta em ok', () => {
    expect(guardOrganizer({ userId: 'user-a', role: 'organizer' })).toEqual({
      kind: 'ok',
    });
  });
});
