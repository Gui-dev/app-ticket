import { type SearchFilters, searchFiltersSchema } from '@ticketvibe/shared';

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearchFilters(raw: RawSearchParams): SearchFilters {
  const result: SearchFilters = {};
  for (const key of ['q', 'category', 'state', 'from', 'to'] as const) {
    const parsed = searchFiltersSchema.safeParse({ [key]: first(raw[key]) });
    if (parsed.success) Object.assign(result, parsed.data);
  }
  return result;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return Boolean(
    filters.q ||
      filters.category ||
      filters.state ||
      filters.from ||
      filters.to,
  );
}
