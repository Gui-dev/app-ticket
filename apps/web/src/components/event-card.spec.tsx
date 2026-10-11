import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventCard } from './event-card';

describe('<EventCard />', () => {
  it('should link the CTA to the event page', () => {
    render(
      <EventCard
        category="Teatro"
        title="O Fantasma da Ópera"
        date="22 de Outubro, 2026"
        venue="Teatro Renault"
        price="R$ 120,00"
        href="/events/o-fantasma-da-opera"
      />,
    );

    expect(screen.getByRole('link', { name: 'Ver Ingressos' })).toHaveAttribute(
      'href',
      '/events/o-fantasma-da-opera',
    );
  });
});
