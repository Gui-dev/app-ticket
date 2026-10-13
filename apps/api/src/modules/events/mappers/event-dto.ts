import type { EventDto } from '@ticketvibe/shared';

import type { EventEntity } from '../domain/event-entity.js';

export function toEventDto(entity: EventEntity): EventDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    category: { slug: entity.categorySlug, name: entity.categoryName },
    venue: {
      slug: entity.venueSlug,
      name: entity.venueName,
      city: entity.venueCity,
      state: entity.venueState,
    },
    startsAt: entity.startsAt.toISOString(),
    priceFromCents: entity.priceFromCents,
    imageUrl: entity.imageUrl,
    badgeLabel: entity.badgeLabel,
  };
}
