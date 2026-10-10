import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchResults } from './search-results';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

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

describe('SearchResults', () => {
  it('renders one card per event', () => {
    render(
      <SearchResults
        filters={{ q: 'cyberpunk' }}
        categories={[]}
        result={{ ok: true, events: [event] }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Cyberpunk Electronic Festival' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 evento encontrado')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'TicketVibe' }),
    ).toBeInTheDocument();
  });

  it('pluralizes the count for multiple events', () => {
    render(
      <SearchResults
        filters={{ q: 'festival' }}
        categories={[]}
        result={{
          ok: true,
          events: [
            event,
            { ...event, id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' },
          ],
        }}
      />,
    );

    expect(screen.getByText('2 eventos encontrados')).toBeInTheDocument();
  });

  it('shows an empty state when no event matches', () => {
    render(
      <SearchResults
        filters={{ q: 'zzz' }}
        categories={[]}
        result={{ ok: true, events: [] }}
      />,
    );

    expect(screen.getByText(/Nenhum evento encontrado/)).toBeInTheDocument();
  });

  it('shows an error state when the request failed', () => {
    render(
      <SearchResults
        filters={{ q: 'zzz' }}
        categories={[]}
        result={{ ok: false, error: 'request_failed' }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível/);
  });
});
