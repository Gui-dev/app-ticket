import { createParser, parseAsString } from 'nuqs';
import type { TransitionStartFunction } from 'react';

export const SEARCH_FILTER_KEYS = [
  'q',
  'category',
  'state',
  'from',
  'to',
] as const;

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

const BASE_OPTIONS = {
  clearOnDefault: true,
  history: 'replace',
  shallow: false,
} as const;

const parseAsTrimmedString = createParser<string>({
  parse: (value) => value.trim(),
  serialize: (value) => value,
});

const parseAsUf = createParser<string>({
  parse: (value) => {
    const trimmed = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
  },
  serialize: (value) => value,
});

export function searchFiltersParsers(
  startTransition?: TransitionStartFunction,
) {
  const options = { ...BASE_OPTIONS, startTransition };
  return {
    q: parseAsTrimmedString.withOptions(options),
    category: parseAsString.withOptions(options),
    state: parseAsUf.withOptions(options),
    from: parseAsString.withOptions(options),
    to: parseAsString.withOptions(options),
  };
}
