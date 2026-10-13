import { renderHook } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it } from 'vitest';
import { searchFiltersParsers } from './search-filters-parsers';

function renderWith(searchParams: string) {
  return renderHook(() => searchFiltersParsers(), {
    wrapper: withNuqsTestingAdapter({ searchParams }),
  });
}

describe('searchFiltersParsers', () => {
  it('normalizes q by trimming and clears it on default', () => {
    const { result } = renderWith('q=%20fanta%20');
    expect(result.current.q.parse('  fanta ')).toBe('fanta');
    expect(result.current.q.defaultValue).toBe('');
    expect(result.current.q.clearOnDefault).toBe(true);
    expect(result.current.q.shallow).toBe(false);
  });

  it('truncates q to the 120 character server cap', () => {
    const { result } = renderWith('');
    const parsed = result.current.q.parse(`  ${'a'.repeat(130)}  `);
    expect(parsed).toHaveLength(120);
    expect(parsed).toBe('a'.repeat(120));
    expect(result.current.q.parse('fanta')).toBe('fanta');
  });

  it('uppercases state and drops invalid UF', () => {
    const { result } = renderWith('state=sp');
    expect(result.current.state.parse('sp')).toBe('SP');
    expect(result.current.state.parse('sao paulo')).toBeNull();
    expect(result.current.state.parse('')).toBeNull();
  });

  it('keeps replace history, non-shallow and clearOnDefault on every parser', () => {
    const { result } = renderWith('');
    for (const parser of Object.values(result.current)) {
      expect(parser.history).toBe('replace');
      expect(parser.shallow).toBe(false);
      expect(parser.clearOnDefault).toBe(true);
      expect(parser.defaultValue).toBe('');
    }
  });
});
