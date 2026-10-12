'use client';

import { useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import { useSearchTransition } from '../components/search-transition';
import { searchFiltersParsers } from './search-filters-parsers';

export function useSearchFilters() {
  const { isPending, startTransition } = useSearchTransition();
  const parsers = useMemo(
    () => searchFiltersParsers(startTransition),
    [startTransition],
  );
  const [filters, setFiltersRaw] = useQueryStates(parsers);

  const setFilters = (
    values: Partial<{
      [K in keyof typeof filters]: (typeof filters)[K] | null;
    }>,
  ) => {
    void setFiltersRaw(values);
  };

  return { filters, setFilters, isPending };
}
