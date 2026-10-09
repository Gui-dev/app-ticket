import type { EventDto } from '@ticketvibe/shared';

import type { EventCardProps } from '@/components/event-card';
import type { HeroCardProps } from '@/components/home/hero-card';

import { formatBRL, formatDatePtBR } from '@/lib/format';

export function toHeroCardProps(event: EventDto): HeroCardProps {
  return {
    badgeLabel: event.badgeLabel ?? undefined,
    categoryName: event.category.name,
    dateLabel: formatDatePtBR(event.startsAt),
    venueLabel: `${event.venue.name}, ${event.venue.state}`,
    title: event.title,
    description: event.description,
    priceLabel: formatBRL(event.priceFromCents),
    imageSrc: event.imageUrl ?? undefined,
  };
}

export function toEventCardProps(event: EventDto): EventCardProps {
  return {
    category: event.category.name,
    venue: event.venue.name,
    date: formatDatePtBR(event.startsAt),
    price: formatBRL(event.priceFromCents),
    title: event.title,
    badgeLabel: event.badgeLabel ?? undefined,
    imageSrc: event.imageUrl ?? undefined,
  };
}
