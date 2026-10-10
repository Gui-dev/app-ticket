import { describe, expect, it } from 'vitest';
import {
  buildSearchPath,
  filtersFromSearchParams,
  hasActiveFilters,
  parseSearchFilters,
} from './search-params';

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
});

describe('filtersFromSearchParams', () => {
  it('reads from a URLSearchParams', () => {
    const params = new URLSearchParams('q=show&category=comedy');
    expect(filtersFromSearchParams(params)).toEqual({
      q: 'show',
      category: 'comedy',
    });
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty filters and true when any filter is set', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: 'x' })).toBe(true);
  });
});

describe('buildSearchPath', () => {
  it('returns / when there are no filters', () => {
    expect(buildSearchPath({})).toBe('/');
  });

  it('serializes filters in a stable order', () => {
    expect(
      buildSearchPath({ q: 'stand', category: 'comedy', state: 'SP' }),
    ).toBe('/?q=stand&category=comedy&state=SP');
  });
});
