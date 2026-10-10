'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';

import { SearchInput } from '@/components/ui/search-input';
import { buildSearchPath, filtersFromSearchParams } from '@/lib/search-params';

function HeaderSearchField() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = filtersFromSearchParams(searchParams);
  const [value, setValue] = useState(filters.q ?? '');

  useEffect(() => {
    setValue(filters.q ?? '');
  }, [filters.q]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    router.replace(buildSearchPath({ ...filters, q: q || undefined }));
  }

  return (
    <search className="hidden max-w-md flex-1 md:flex">
      <form onSubmit={onSubmit} className="contents">
        <SearchInput
          type="search"
          aria-label="Buscar eventos"
          placeholder="Buscar shows, teatro, comédia, cidade."
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </search>
  );
}

function HeaderSearchFallback() {
  return <div className="hidden max-w-md flex-1 md:block" aria-hidden />;
}

export function HeaderSearch() {
  return (
    <Suspense fallback={<HeaderSearchFallback />}>
      <HeaderSearchField />
    </Suspense>
  );
}
