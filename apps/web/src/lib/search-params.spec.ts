import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseSearchFilters } from './search-params';

describe('parseSearchFilters', () => {
  it('reads a plain record and trims/normalizes values', () => {
    expect(
      parseSearchFilters({ q: '  teatro ', state: 'sp', from: '2026-11-01' }),
    ).toEqual({ q: 'teatro', state: 'SP', from: '2026-11-01' });
  });

  it('uses the first value of an array param', () => {
    expect(parseSearchFilters({ q: ['a', 'b'] })).toEqual({ q: 'a' });
  });

  it('drops invalid values instead of throwing', () => {
    expect(parseSearchFilters({ state: 'XYZ', from: 'nope' })).toEqual({});
  });

  it('keeps valid filters when another value is invalid', () => {
    expect(parseSearchFilters({ q: 'teatro', state: 'XYZ' })).toEqual({
      q: 'teatro',
    });
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty filters and true when any filter is set', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: 'x' })).toBe(true);
  });
});
