import type { EventDto } from '@ticketvibe/shared';
import { listEventsResponseSchema } from '@ticketvibe/shared';
import { describe, expect, test } from 'vitest';
import { toEventCardProps, toHeroCardProps } from './event-mapper';

const eventoFeatured: EventDto = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'espetaculo-internacional-sp',
  title: 'Espetáculo Internacional',
  description: 'Uma noite inesquecível no Teatro Renault.',
  category: { slug: 'shows', name: 'Shows' },
  venue: { name: 'Teatro Renault', city: 'São Paulo', state: 'SP' },
  startsAt: '2026-10-22T23:00:00Z',
  priceFromCents: 12000,
  imageUrl: null,
  badgeLabel: 'Espetáculo Internacional',
};

describe('toHeroCardProps', () => {
  test('maps the featured event dto to hero card props', () => {
    expect(
      listEventsResponseSchema.safeParse({ events: [eventoFeatured] }).success,
    ).toBe(true);
    expect(toHeroCardProps(eventoFeatured)).toStrictEqual({
      badgeLabel: 'Espetáculo Internacional',
      categoryName: 'Shows',
      dateLabel: '22 de Outubro, 2026',
      venueLabel: 'Teatro Renault, SP',
      title: 'Espetáculo Internacional',
      description: 'Uma noite inesquecível no Teatro Renault.',
      priceLabel: 'R$ 120,00',
      imageSrc: undefined,
    });
    expect(
      toHeroCardProps({
        ...eventoFeatured,
        imageUrl: 'https://example.com/image.jpg',
      }).imageSrc,
    ).toBe('https://example.com/image.jpg');
  });

  test('normalizes a null badgeLabel to undefined for the hero fallback', () => {
    const result = toHeroCardProps({ ...eventoFeatured, badgeLabel: null });
    expect(result.badgeLabel).toBeUndefined();
  });
});

describe('toEventCardProps', () => {
  test('maps the event dto to event card props', () => {
    expect(toEventCardProps(eventoFeatured)).toStrictEqual({
      category: 'Shows',
      venue: 'Teatro Renault',
      date: '22 de Outubro, 2026',
      price: 'R$ 120,00',
      title: 'Espetáculo Internacional',
      badgeLabel: 'Espetáculo Internacional',
      imageSrc: undefined,
    });
  });

  test('renders the Sao Paulo local date for a UTC eve instant', () => {
    const result = toEventCardProps({
      ...eventoFeatured,
      startsAt: '2026-10-23T02:00:00Z',
    });
    expect(result.date).toBe('22 de Outubro, 2026');
  });
});
