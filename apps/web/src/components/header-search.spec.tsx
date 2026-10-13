import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  NuqsTestingAdapter,
  type UrlUpdateEvent,
  withNuqsTestingAdapter,
} from 'nuqs/adapters/testing';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SUGGESTIONS_LISTBOX_ID } from '../lib/use-search-suggestions';
import { HeaderSearch } from './header-search';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const SUGGEST_URL = 'http://localhost:3000/api/suggest';

const eventFixture = {
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  startsAt: '2026-10-22T23:00:00.000Z',
  venueName: 'Teatro Renault',
  venueCity: 'São Paulo',
  venueState: 'SP',
  priceFromCents: 12000,
};

const locationFixture = { city: 'Rio de Janeiro', state: 'RJ' };

const server = setupServer(
  http.get(SUGGEST_URL, () =>
    HttpResponse.json({ events: [eventFixture], locations: [locationFixture] }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});
afterAll(() => server.close());

function renderSearch(
  searchParams = '',
  onUrlUpdate?: (event: UrlUpdateEvent) => void,
) {
  return render(<HeaderSearch />, {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }),
  });
}

function getCombobox() {
  return screen.getByRole('combobox', {
    name: 'Buscar eventos',
  }) as HTMLInputElement;
}

async function openSuggestions(input: HTMLInputElement) {
  fireEvent.change(input, { target: { value: 'fanta' } });
  await waitFor(
    () => expect(screen.getAllByRole('option').length).toBeGreaterThan(0),
    { timeout: 3000 },
  );
}

describe('HeaderSearch', () => {
  it('keeps the search label and placeholder copy', () => {
    renderSearch();

    expect(getCombobox()).toHaveAttribute(
      'placeholder',
      'Buscar shows, teatro, comédia, cidade.',
    );
  });

  it('navigates to the search URL on submit', async () => {
    const onUrlUpdate = vi.fn();
    renderSearch('', onUrlUpdate);

    const input = getCombobox();
    fireEvent.change(input, { target: { value: '  cyberpunk ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const event = onUrlUpdate.mock.calls[0][0] as UrlUpdateEvent;
    expect(event.queryString).toContain('q=cyberpunk');
    expect(event.options.history).toBe('replace');
  });

  it('clears the query when the field is emptied', async () => {
    const onUrlUpdate = vi.fn();
    renderSearch('q=fantasma', onUrlUpdate);

    const input = getCombobox();
    expect(input.value).toBe('fantasma');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const event = onUrlUpdate.mock.calls.at(-1)?.[0] as UrlUpdateEvent;
    expect(event.queryString).not.toContain('q=');
  });

  it('reflects a query removed externally', () => {
    const onUrlUpdate = vi.fn();
    const { rerender } = render(
      <NuqsTestingAdapter
        searchParams="q=cyberpunk"
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <HeaderSearch />
      </NuqsTestingAdapter>,
    );

    expect(getCombobox().value).toBe('cyberpunk');

    rerender(
      <NuqsTestingAdapter searchParams="" hasMemory onUrlUpdate={onUrlUpdate}>
        <HeaderSearch />
      </NuqsTestingAdapter>,
    );

    expect(getCombobox().value).toBe('');
  });

  it('exposes combobox aria wiring while the panel is closed', () => {
    renderSearch();

    const input = getCombobox();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('leaves Enter unconsumed without a highlighted suggestion', async () => {
    renderSearch();

    const input = getCombobox();
    await openSuggestions(input);

    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'false',
    );

    const enterWasPrevented = !fireEvent.keyDown(input, { key: 'Enter' });
    expect(enterWasPrevented).toBe(false);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('pushes to the event page when an event suggestion is selected', async () => {
    renderSearch();

    const input = getCombobox();
    await openSuggestions(input);

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', SUGGESTIONS_LISTBOX_ID);

    fireEvent.mouseDown(screen.getAllByRole('option')[0]);

    expect(push).toHaveBeenCalledWith('/events/o-fantasma-da-opera');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('sets q when a location suggestion is selected', async () => {
    const onUrlUpdate = vi.fn();
    renderSearch('', onUrlUpdate);

    const input = getCombobox();
    await openSuggestions(input);

    const locationOption = screen.getAllByRole('option')[1];
    expect(locationOption).toHaveTextContent('Rio de Janeiro, RJ');
    fireEvent.mouseDown(locationOption);

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const event = onUrlUpdate.mock.calls.at(-1)?.[0] as UrlUpdateEvent;
    expect(event.searchParams.get('q')).toBe('Rio de Janeiro');
    expect(input.value).toBe('Rio de Janeiro');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the typed text when Escape closes the panel', async () => {
    renderSearch();

    const input = getCombobox();
    await openSuggestions(input);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('fanta');
    expect(input).not.toHaveAttribute('aria-controls');
  });

  it('announces the suggestions panel through a polite live region', async () => {
    renderSearch();

    const region = document.querySelector('p[aria-live="polite"]');
    expect(region?.textContent).toBe('');

    fireEvent.change(getCombobox(), { target: { value: 'fanta' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(region?.textContent).toBe('');

    await waitFor(
      () => expect(screen.getAllByRole('option').length).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    expect(region?.textContent).toBe('Sugestões de busca disponíveis');
  });
});
