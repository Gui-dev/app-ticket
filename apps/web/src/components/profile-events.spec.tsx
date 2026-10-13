import { render, screen } from '@testing-library/react';
import type { EventDto } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';

import { ProfileEvents } from './profile-events';

const events: EventDto[] = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    slug: 'standup-noite-de-verdades',
    title: 'Stand-up: Noite de Verdades',
    description: 'Piadas sem filtro.',
    category: { slug: 'comedy', name: 'Comédia' },
    venue: {
      slug: 'espaco-unimed',
      name: 'Espaço Unimed',
      city: 'São Paulo',
      state: 'SP',
    },
    startsAt: '2026-11-06T00:00:00.000Z',
    priceFromCents: 9000,
    imageUrl: null,
    badgeLabel: null,
  },
];

describe('ProfileEvents', () => {
  it('renders heading, count and the event cards', () => {
    render(
      <ProfileEvents
        name="Comediantes Afiados"
        cityState={null}
        events={events}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Comediantes Afiados' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 evento encontrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver Ingressos/ })).toHaveAttribute(
      'href',
      '/events/standup-noite-de-verdades',
    );
  });

  it('renders the empty state when there are no events', () => {
    render(<ProfileEvents name="Sem Shows" cityState={null} events={[]} />);

    expect(screen.getByText('Nenhum evento no momento.')).toBeInTheDocument();
  });

  it('renders city and state when provided', () => {
    render(
      <ProfileEvents
        name="Teatro Renault"
        cityState="São Paulo/SP"
        events={events}
      />,
    );

    expect(screen.getByText('São Paulo/SP')).toBeInTheDocument();
  });
});
