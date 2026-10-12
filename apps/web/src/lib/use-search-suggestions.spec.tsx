import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  DEBOUNCE_MS,
  MIN_QUERY_LENGTH,
  SUGGESTIONS_LISTBOX_ID,
  suggestionOptionId,
  useSearchSuggestions,
} from './use-search-suggestions';

const SUGGEST_URL = 'http://localhost:3000/api/suggest';

const eventFixture = {
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  startsAt: '2026-10-22T23:00:00Z',
  venueName: 'Audio Club',
  venueCity: 'São Paulo',
  venueState: 'SP',
  priceFromCents: 8000,
};

const locationFixture = { city: 'São Paulo', state: 'SP' };

const server = setupServer(
  http.get(SUGGEST_URL, () =>
    HttpResponse.json({ events: [eventFixture], locations: [locationFixture] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

async function renderReady(onSelect = vi.fn()) {
  const utils = renderHook(() => useSearchSuggestions({ onSelect }));
  act(() => {
    utils.result.current.setQuery('fanta');
  });
  await waitFor(() => expect(utils.result.current.status).toBe('ready'), {
    timeout: 3000,
  });
  return { ...utils, onSelect };
}

describe('useSearchSuggestions', () => {
  it('stays idle below the minimum query length', async () => {
    const handler = vi.fn(() =>
      HttpResponse.json({ events: [], locations: [] }),
    );
    server.use(http.get(SUGGEST_URL, handler));

    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('a');
    });
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 150));

    expect(result.current.status).toBe('idle');
    expect(result.current.open).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('sets loading immediately, debounces, then becomes ready with flattened items', async () => {
    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('fanta');
    });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 3000,
    });

    expect(result.current.open).toBe(true);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toMatchObject({ kind: 'event', index: 0 });
    expect(result.current.items[0]).toMatchObject({ event: eventFixture });
    expect(result.current.items[1]).toMatchObject({
      kind: 'location',
      index: 1,
    });
    expect(result.current.items[1]).toMatchObject({
      location: locationFixture,
    });
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.activeDescendant).toBe(suggestionOptionId(0));
  });

  it('becomes empty and closes the panel when there are no results', async () => {
    server.use(
      http.get(SUGGEST_URL, () =>
        HttpResponse.json({ events: [], locations: [] }),
      ),
    );

    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('zzzz');
    });

    await waitFor(() => expect(result.current.status).toBe('empty'), {
      timeout: 3000,
    });
    expect(result.current.open).toBe(false);
    expect(result.current.items).toHaveLength(0);
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.activeDescendant).toBeUndefined();
  });

  it('becomes error and closes the panel on a failed response', async () => {
    server.use(
      http.get(SUGGEST_URL, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('fanta');
    });

    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 3000,
    });
    expect(result.current.open).toBe(false);
    expect(result.current.activeDescendant).toBeUndefined();
  });

  it('selects the active item on Enter and ignores Enter without a highlight', async () => {
    const { result, onSelect } = await renderReady();

    const first = keyDownWith(result, 'Enter');
    expect(first.wasHandled()).toBe(true);
    expect(first.preventDefault).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(result.current.items[0]);
    expect(result.current.open).toBe(false);

    act(() => {
      result.current.reopen();
    });
    act(() => {
      result.current.setActiveIndex(-1);
    });

    const second = keyDownWith(result, 'Enter');
    expect(second.wasHandled()).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('cycles the active index with arrow keys and reopens on ArrowDown', async () => {
    const { result } = await renderReady();

    expect(result.current.activeIndex).toBe(0);

    const down = keyDownWith(result, 'ArrowDown');
    expect(down.wasHandled()).toBe(true);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(result.current.activeIndex).toBe(1);

    const up = keyDownWith(result, 'ArrowUp');
    expect(up.wasHandled()).toBe(true);
    expect(result.current.activeIndex).toBe(0);

    keyDownWith(result, 'ArrowUp');
    expect(result.current.activeIndex).toBe(1);

    keyDownWith(result, 'ArrowDown');
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(false);

    const reopenDown = keyDownWith(result, 'ArrowDown');
    expect(reopenDown.wasHandled()).toBe(true);
    expect(result.current.open).toBe(true);
    expect(result.current.activeIndex).toBe(0);
  });

  it('closes on Escape when open and is a no-op when closed', async () => {
    const { result } = await renderReady();
    expect(result.current.open).toBe(true);

    const openEscape = keyDownWith(result, 'Escape');
    expect(openEscape.preventDefault).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
    expect(result.current.activeIndex).toBe(-1);

    const closedEscape = keyDownWith(result, 'Escape');
    expect(closedEscape.preventDefault).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it('exposes stable ARIA ids and the active descendant only while open', async () => {
    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    expect(result.current.listboxId).toBe(SUGGESTIONS_LISTBOX_ID);
    expect(suggestionOptionId(0)).toBe('search-suggestion-option-0');
    expect(result.current.activeDescendant).toBeUndefined();

    act(() => {
      result.current.setQuery('fanta');
    });
    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 3000,
    });

    expect(result.current.activeDescendant).toBe('search-suggestion-option-0');

    act(() => {
      result.current.setActiveIndex(1);
    });
    expect(result.current.activeDescendant).toBe('search-suggestion-option-1');

    act(() => {
      result.current.close();
    });
    expect(result.current.activeDescendant).toBeUndefined();
  });

  it('resets to idle and drops data when the query is cleared', async () => {
    const { result } = await renderReady();
    expect(result.current.items).toHaveLength(2);

    act(() => {
      result.current.setQuery('');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.events).toHaveLength(0);
    expect(result.current.locations).toHaveLength(0);
    expect(result.current.items).toHaveLength(0);
    expect(result.current.open).toBe(false);
    expect(result.current.activeIndex).toBe(-1);
  });

  it('debounces rapid query changes into a single request for the latest query', async () => {
    let calls = 0;
    let lastQuery = '';
    server.use(
      http.get(SUGGEST_URL, ({ request }) => {
        calls += 1;
        lastQuery = new URL(request.url).searchParams.get('q') ?? '';
        return HttpResponse.json({
          events: [eventFixture],
          locations: [],
        });
      }),
    );

    const { result } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('fa');
    });
    act(() => {
      result.current.setQuery('fan');
    });

    await waitFor(() => expect(result.current.status).toBe('ready'), {
      timeout: 3000,
    });
    expect(calls).toBe(1);
    expect(lastQuery).toBe('fan');
  });

  it('closes the panel on an outside pointerdown and keeps it open on inside clicks', async () => {
    const { result } = await renderReady();

    const root = document.createElement('div');
    const inside = document.createElement('div');
    root.append(inside);
    document.body.append(root);
    result.current.rootRef.current = root;

    act(() => {
      inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(result.current.open).toBe(true);

    act(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      );
    });
    expect(result.current.open).toBe(false);
    expect(result.current.activeIndex).toBe(-1);

    root.remove();
  });

  it('aborts the in-flight request on unmount without errors', async () => {
    server.use(
      http.get(SUGGEST_URL, async () => {
        await delay(400);
        return HttpResponse.json({
          events: [eventFixture],
          locations: [],
        });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useSearchSuggestions({ onSelect: vi.fn() }),
    );

    act(() => {
      result.current.setQuery('fanta');
    });
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 500));
  });
});

function keyDownWith(
  result: { current: ReturnType<typeof useSearchSuggestions> },
  key: string,
) {
  const preventDefault = vi.fn();
  let handled = false;
  act(() => {
    handled = result.current.handleKeyDown({ key, preventDefault });
  });
  return { preventDefault, wasHandled: () => handled };
}
