'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useState } from 'react';

import { SearchSuggestions } from '@/components/search-suggestions';
import { SearchInput } from '@/components/ui/search-input';
import { useSearchFilters } from '@/lib/use-search-filters';
import {
  SUGGESTIONS_LISTBOX_ID,
  type SuggestionItem,
  useSearchSuggestions,
} from '@/lib/use-search-suggestions';

function HeaderSearchField() {
  const router = useRouter();
  const { filters, setFilters } = useSearchFilters();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(filters.q ?? '');
  }, [filters.q]);

  const handleSelect = (item: SuggestionItem) => {
    if (item.kind === 'event') {
      router.push(`/events/${item.event.slug}`);
      return;
    }
    setFilters({ q: item.location.city });
    setValue(item.location.city);
  };

  const suggestions = useSearchSuggestions({ onSelect: handleSelect });

  const panelVisible = suggestions.panelVisible;
  const suggestionsReady = suggestions.open && suggestions.status === 'ready';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    suggestions.close();
    const trimmed = value.trim();
    setFilters({ q: trimmed === '' ? null : trimmed });
  };

  return (
    <search className="hidden max-w-md flex-1 md:flex">
      <div ref={suggestions.rootRef} className="relative w-full max-w-md">
        <form onSubmit={onSubmit} className="contents">
          <SearchInput
            type="search"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              suggestions.setQuery(event.target.value);
            }}
            onKeyDown={suggestions.handleKeyDown}
            onFocus={() => {
              if (value !== suggestions.query) {
                suggestions.setQuery(value);
              }
              suggestions.reopen();
            }}
            role="combobox"
            aria-expanded={panelVisible}
            aria-controls={panelVisible ? SUGGESTIONS_LISTBOX_ID : undefined}
            aria-activedescendant={suggestions.activeDescendant}
            aria-autocomplete="list"
            aria-label="Buscar eventos"
            placeholder="Buscar shows, teatro, comédia, cidade."
          />
        </form>
        <p aria-live="polite" className="sr-only">
          {suggestionsReady ? 'Sugestões de busca disponíveis' : ''}
        </p>
        {panelVisible && (
          <SearchSuggestions
            open={suggestions.open}
            status={suggestions.status}
            items={suggestions.items}
            activeIndex={suggestions.activeIndex}
            listboxId={SUGGESTIONS_LISTBOX_ID}
            query={suggestions.query}
            highlighted={suggestions.highlighted}
            onHover={suggestions.setActiveIndex}
            onSelect={(item) => {
              suggestions.close();
              handleSelect(item);
            }}
          />
        )}
      </div>
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
