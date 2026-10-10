import { type SearchFilters, searchFiltersSchema } from '@ticketvibe/shared';

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSearchFilters(raw: RawSearchParams): SearchFilters {
  const parsed = searchFiltersSchema.safeParse({
    q: first(raw.q),
    category: first(raw.category),
    state: first(raw.state),
    from: first(raw.from),
    to: first(raw.to),
  });
  return parsed.success ? parsed.data : {};
}

export function filtersFromSearchParams(
  params: URLSearchParams,
): SearchFilters {
  return parseSearchFilters({
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    state: params.get('state') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  });
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

export function buildSearchPath(filters: SearchFilters): string {
  const params = new URLSearchParams();

  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.state) params.set('state', filters.state);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const query = params.toString();
  return query ? `/?${query}` : '/';
}
