'use client';

import { cn } from 'cn';
import type { ReactNode } from 'react';
import { formatBRL, formatDatePtBR } from '@/lib/format';
import {
  type SuggestionItem,
  type SuggestionStatus,
  suggestionOptionId,
} from '@/lib/use-search-suggestions';

export interface SearchSuggestionsProps {
  open: boolean;
  status: SuggestionStatus;
  items: SuggestionItem[];
  activeIndex: number;
  listboxId: string;
  query: string;
  highlighted: (text: string, query: string) => ReactNode;
  onHover: (index: number) => void;
  onSelect: (item: SuggestionItem) => void;
}

const SKELETON_IDS = ['skeleton-0', 'skeleton-1', 'skeleton-2'] as const;

function EventOption({
  item,
  active,
  query,
  highlighted,
  onHover,
  onSelect,
}: Pick<
  SearchSuggestionsProps,
  'query' | 'highlighted' | 'onHover' | 'onSelect'
> & { item: Extract<SuggestionItem, { kind: 'event' }>; active: boolean }) {
  const { event } = item;
  return (
    <div
      role="option"
      id={suggestionOptionId(item.index)}
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={(mouseEvent) => {
        mouseEvent.preventDefault();
        onSelect(item);
      }}
      onMouseEnter={() => onHover(item.index)}
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 px-3 py-2',
        active && 'bg-secondary',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-foreground">
          {highlighted(event.title, query)}
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">
          {formatBRL(event.priceFromCents)}
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {formatDatePtBR(event.startsAt)} · {event.venueName} · {event.venueCity}
      </p>
    </div>
  );
}

function LocationOption({
  item,
  active,
  onHover,
  onSelect,
}: Pick<SearchSuggestionsProps, 'onHover' | 'onSelect'> & {
  item: Extract<SuggestionItem, { kind: 'location' }>;
  active: boolean;
}) {
  const { location } = item;
  return (
    <div
      role="option"
      id={suggestionOptionId(item.index)}
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={(mouseEvent) => {
        mouseEvent.preventDefault();
        onSelect(item);
      }}
      onMouseEnter={() => onHover(item.index)}
      className={cn(
        'cursor-pointer px-3 py-2 text-sm text-foreground',
        active && 'bg-secondary',
      )}
    >
      {location.city}, {location.state}
    </div>
  );
}

function SearchSuggestions({
  open,
  status,
  items,
  activeIndex,
  listboxId,
  query,
  highlighted,
  onHover,
  onSelect,
}: SearchSuggestionsProps) {
  if (!open && status !== 'loading') return null;

  const loading = status === 'loading';
  if (!loading && items.length === 0) return null;

  const eventItems = items.filter(
    (item): item is Extract<SuggestionItem, { kind: 'event' }> =>
      item.kind === 'event',
  );
  const locationItems = items.filter(
    (item): item is Extract<SuggestionItem, { kind: 'location' }> =>
      item.kind === 'location',
  );

  const optionProps = { query, highlighted, onHover, onSelect };

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Sugestões de busca"
      aria-busy={loading}
      className="absolute top-full left-0 right-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-card"
    >
      {loading ? (
        <>
          <span className="sr-only">Carregando sugestões…</span>
          {SKELETON_IDS.map((id) => (
            <div
              key={id}
              data-testid="suggestion-skeleton"
              className="mx-3 my-2 h-10 animate-pulse rounded bg-secondary"
            />
          ))}
        </>
      ) : null}
      {!loading && eventItems.length > 0 ? (
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="sr-only">Eventos</legend>
          {eventItems.map((item) => (
            <EventOption
              key={item.index}
              item={item}
              active={activeIndex === item.index}
              {...optionProps}
            />
          ))}
        </fieldset>
      ) : null}
      {!loading && locationItems.length > 0 ? (
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="sr-only">Locais</legend>
          {locationItems.map((item) => (
            <LocationOption
              key={item.index}
              item={item}
              active={activeIndex === item.index}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

export { SearchSuggestions };
