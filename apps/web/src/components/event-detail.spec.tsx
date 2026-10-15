import { render, screen, within } from '@testing-library/react';
import type { EventDetailDto } from '@ticketvibe/shared';
import { describe, expect, test } from 'vitest';
import {
  EventDetail,
  EventDetailError,
  EventDetailSkeleton,
} from './event-detail';

const evento: EventDetailDto = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'o-fantasma-da-opera',
  title: 'O Fantasma da Ópera',
  description: 'O musical internacional mais famoso do mundo.',
  category: { slug: 'shows', name: 'Shows' },
  venue: {
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
  },
  startsAt: '2026-10-22T23:00:00Z',
  priceFromCents: 12000,
  imageUrl: null,
  badgeLabel: 'Espetáculo Internacional',
  sectors: [
    {
      slug: 'plateia',
      name: 'Plateia',
      priceFromCents: 12000,
      seatsAvailable: 91,
    },
    {
      slug: 'balcao',
      name: 'Balcão',
      priceFromCents: 19000,
      seatsAvailable: null,
    },
  ],
  artists: [{ slug: 'andrew-lloyd-webber', name: 'Andrew Lloyd Webber' }],
};

describe('EventDetail', () => {
  test('renders the event title', () => {
    render(<EventDetail event={evento} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'O Fantasma da Ópera' }),
    ).toBeInTheDocument();
  });

  test('renders each sector name with its formatted BRL price', () => {
    render(<EventDetail event={evento} />);

    const sectorsList = screen.getByRole('list');

    expect(within(sectorsList).getByText('Plateia')).toBeInTheDocument();
    expect(within(sectorsList).getByText('R$ 120,00')).toBeInTheDocument();
    expect(within(sectorsList).getByText('Balcão')).toBeInTheDocument();
    expect(within(sectorsList).getByText('R$ 190,00')).toBeInTheDocument();
  });

  test('links the purchase CTA to the checkout placeholder route', () => {
    render(<EventDetail event={evento} />);

    expect(
      screen.getByRole('link', { name: 'Escolher ingressos' }),
    ).toHaveAttribute('href', '/events/o-fantasma-da-opera/ingressos');
  });

  test('shows a friendly message when no sectors are published', () => {
    render(<EventDetail event={{ ...evento, sectors: [] }} />);

    expect(
      screen.getByText('Setores em divulgação em breve.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('shows published seat availability per sector', () => {
    render(<EventDetail event={evento} />);

    expect(screen.getByText('91 lugares disponíveis')).toBeInTheDocument();
  });

  test('marks a sector as esgotado when no seats are left', () => {
    render(
      <EventDetail
        event={{
          ...evento,
          sectors: [
            {
              slug: 'plateia',
              name: 'Plateia',
              priceFromCents: 12000,
              seatsAvailable: 0,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Esgotado')).toBeInTheDocument();
  });

  test('links the venue name to the venue page', () => {
    render(<EventDetail event={evento} />);

    const venueLink = screen.getByRole('link', { name: /Teatro Renault/ });
    expect(venueLink).toHaveAttribute('href', '/venues/teatro-renault');
  });

  test('lists artists linking to their pages', () => {
    render(<EventDetail event={evento} />);

    const artistLink = screen.getByRole('link', {
      name: 'Andrew Lloyd Webber',
    });
    expect(artistLink).toHaveAttribute('href', '/artists/andrew-lloyd-webber');
  });
});

describe('EventDetailSkeleton', () => {
  test('is aria-hidden so screen readers skip the loading state', () => {
    const { container } = render(<EventDetailSkeleton />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EventDetailError', () => {
  test('renders the error message and a way back home', () => {
    render(<EventDetailError />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Não foi possível carregar o evento',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voltar para a home' }),
    ).toHaveAttribute('href', '/');
  });
});
