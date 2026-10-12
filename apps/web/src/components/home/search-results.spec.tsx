import { render, screen } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it } from 'vitest';
import { SearchResults } from './search-results';

const event = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'cyberpunk-electronic-festival',
  title: 'Cyberpunk Electronic Festival',
  description: 'Festival techno.',
  category: { slug: 'festivais', name: 'Festivais' },
  venue: { name: 'Parque Olímpico', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-12-05T17:00:00.000Z',
  priceFromCents: 29000,
  imageUrl: null,
  badgeLabel: null,
};

function renderResults(
  filters: { q?: string },
  result: Parameters<typeof SearchResults>[0]['result'],
) {
  return render(
    <SearchResults filters={filters} categories={[]} result={result} />,
    { wrapper: withNuqsTestingAdapter({ searchParams: '' }) },
  );
}

describe('SearchResults', () => {
  it('renders one card per event', () => {
    renderResults({ q: 'cyberpunk' }, { ok: true, events: [event] });

    expect(
      screen.getByRole('heading', { name: 'Cyberpunk Electronic Festival' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 evento encontrado')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'TicketVibe' }),
    ).toBeInTheDocument();
  });

  it('pluralizes the count for multiple events', () => {
    renderResults(
      { q: 'festival' },
      {
        ok: true,
        events: [
          event,
          { ...event, id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' },
        ],
      },
    );

    expect(screen.getByText('2 eventos encontrados')).toBeInTheDocument();
  });

  it('shows an empty state when no event matches', () => {
    renderResults({ q: 'zzz' }, { ok: true, events: [] });

    expect(screen.getByText(/Nenhum evento encontrado/)).toBeInTheDocument();
  });

  it('shows an error state when the request failed', () => {
    renderResults({ q: 'zzz' }, { ok: false, error: 'request_failed' });

    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível/);
  });
});
