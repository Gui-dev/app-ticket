'use client';

import {
  type SuggestResponse,
  suggestResponseSchema,
} from '@ticketvibe/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { highlighted } from './highlight';

export const SUGGESTIONS_LISTBOX_ID = 'search-suggestions-listbox';
export const suggestionOptionId = (index: number) =>
  `search-suggestion-option-${index}`;
export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 250;

export type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export type SuggestionItem =
  | { kind: 'event'; index: number; event: SuggestResponse['events'][number] }
  | {
      kind: 'location';
      index: number;
      location: SuggestResponse['locations'][number];
    };

export interface SuggestionKeyDownEvent {
  key: string;
  preventDefault(): void;
}

interface UseSearchSuggestionsOptions {
  onSelect: (item: SuggestionItem) => void;
}

const EMPTY_EVENTS: SuggestResponse['events'] = [];
const EMPTY_LOCATIONS: SuggestResponse['locations'] = [];

export function useSearchSuggestions({
  onSelect,
}: UseSearchSuggestionsOptions) {
  const [query, setQueryState] = useState('');
  const [status, setStatus] = useState<SuggestionStatus>('idle');
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  const onSelectRef = useRef(onSelect);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const trimmed = query.trim();
    dismissedRef.current = false;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setStatus('idle');
      setData(null);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = new URL('/api/suggest', window.location.origin);
        url.searchParams.set('q', trimmed);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Suggest request failed with ${response.status}`);
        }
        const payload = suggestResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        const hasResults =
          payload.events.length > 0 || payload.locations.length > 0;
        setData(payload);
        setStatus(hasResults ? 'ready' : 'empty');
        if (!dismissedRef.current) {
          setOpen(hasResults);
          setActiveIndex(-1);
        }
      } catch {
        if (controller.signal.aborted) return;
        setData(null);
        setStatus('error');
        setOpen(false);
        setActiveIndex(-1);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const events = useMemo(() => data?.events ?? EMPTY_EVENTS, [data]);
  const locations = useMemo(() => data?.locations ?? EMPTY_LOCATIONS, [data]);
  const items = useMemo<SuggestionItem[]>(
    () => [
      ...events.map((event, index) => ({
        kind: 'event' as const,
        index,
        event,
      })),
      ...locations.map((location, index) => ({
        kind: 'location' as const,
        index: events.length + index,
        location,
      })),
    ],
    [events, locations],
  );

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  const close = useCallback(() => {
    dismissedRef.current = true;
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const reopen = useCallback(() => {
    if (items.length > 0 && status === 'ready') {
      setOpen(true);
    }
  }, [items.length, status]);

  const selectIndex = useCallback(
    (index: number) => {
      const item = items[index];
      setOpen(false);
      setActiveIndex(-1);
      if (item) onSelectRef.current(item);
    },
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  /** Returns true when the event was consumed (suppress native form submit). */
  const handleKeyDown = useCallback(
    (event: SuggestionKeyDownEvent): boolean => {
      switch (event.key) {
        case 'Escape': {
          if (open) {
            event.preventDefault();
            close();
          }
          return false;
        }
        case 'ArrowDown': {
          if (status !== 'ready' || items.length === 0) return false;
          event.preventDefault();
          setOpen(true);
          setActiveIndex((current) =>
            current < 0 || current >= items.length - 1 ? 0 : current + 1,
          );
          return true;
        }
        case 'ArrowUp': {
          if (!open || status !== 'ready' || items.length === 0) return false;
          event.preventDefault();
          setActiveIndex((current) =>
            current <= 0 ? items.length - 1 : current - 1,
          );
          return true;
        }
        case 'Enter': {
          if (
            open &&
            status === 'ready' &&
            activeIndex >= 0 &&
            items[activeIndex]
          ) {
            event.preventDefault();
            selectIndex(activeIndex);
            return true;
          }
          return false;
        }
        default:
          return false;
      }
    },
    [open, close, items, activeIndex, selectIndex, status],
  );

  const activeDescendant =
    open && status === 'ready' && activeIndex >= 0
      ? suggestionOptionId(activeIndex)
      : undefined;

  return {
    query,
    setQuery,
    status,
    open,
    setOpen,
    close,
    reopen,
    events,
    locations,
    items,
    activeIndex,
    setActiveIndex,
    selectIndex,
    handleKeyDown,
    rootRef,
    listboxId: SUGGESTIONS_LISTBOX_ID,
    activeDescendant,
    highlighted,
  };
}
