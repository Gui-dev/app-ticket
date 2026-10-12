import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatBRL, formatDatePtBR } from '../lib/format';
import type { SuggestionItem } from '../lib/use-search-suggestions';
import { SearchSuggestions } from './search-suggestions';

const eventItem = {
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  startsAt: '2026-10-22T23:00:00.000Z',
  venueName: 'Teatro Renault',
  venueCity: 'São Paulo',
  venueState: 'SP',
  priceFromCents: 12000,
};

function renderPanel(
  overrides?: Partial<ComponentProps<typeof SearchSuggestions>>,
) {
  const props: ComponentProps<typeof SearchSuggestions> = {
    open: true,
    status: 'ready',
    items: [
      { kind: 'event', index: 0, event: eventItem },
      {
        kind: 'location',
        index: 1,
        location: { city: 'São Paulo', state: 'SP' },
      },
    ] satisfies SuggestionItem[],
    activeIndex: 0,
    listboxId: 'search-suggestions-listbox',
    onHover: vi.fn(),
    onSelect: vi.fn(),
    query: 'fanta',
    highlighted: (text: string) => text,
    ...overrides,
  };
  return { ...render(<SearchSuggestions {...props} />), props };
}

describe('SearchSuggestions', () => {
  it('renders nothing when closed and not loading', () => {
    renderPanel({ open: false, status: 'ready', items: [] });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders a listbox with groups and options', () => {
    renderPanel();
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-label', 'Sugestões de busca');
    expect(screen.getByRole('group', { name: 'Eventos' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Locais' })).toBeDefined();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('id', 'search-suggestion-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('renders event details with formatted date and price', () => {
    renderPanel();
    expect(
      screen.getByText(
        new RegExp(
          `${formatDatePtBR(eventItem.startsAt)} · Teatro Renault · São Paulo`,
        ),
      ),
    ).toBeDefined();
    expect(screen.getByText(formatBRL(eventItem.priceFromCents))).toBeDefined();
    expect(screen.getByText('São Paulo, SP')).toBeDefined();
  });

  it('selects on mouse down but not on click', () => {
    const onSelect = vi.fn();
    renderPanel({ onSelect });
    const options = screen.getAllByRole('option');
    fireEvent.mouseDown(options[1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].kind).toBe('location');
    fireEvent.click(options[1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('highlights the query in the event title', () => {
    renderPanel({
      highlighted: (text: string) => text.replace('Fantasma', '[Fantasma]'),
    });
    expect(screen.getByText('O [Fantasma] da Ópera')).toBeDefined();
  });

  it('shows skeletons while loading', () => {
    renderPanel({ status: 'loading', items: [], open: true });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(
      document.querySelectorAll('[data-testid="suggestion-skeleton"]').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('shows skeletons while loading before the panel is open', () => {
    renderPanel({ status: 'loading', items: [], open: false });
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando sugestões…')).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-testid="suggestion-skeleton"]').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('renders nothing when empty even if a consumer passes open', () => {
    renderPanel({ status: 'empty', items: [] });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
