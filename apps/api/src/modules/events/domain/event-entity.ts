import type { ListEventsQuery } from '@ticketvibe/shared';

export type EventView = NonNullable<ListEventsQuery['view']>;

export interface EventEntity {
  id: string;
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  startsAt: Date;
  priceFromCents: number;
  imageUrl: string | null;
  badgeLabel: string | null;
  featured: boolean;
  isHot: boolean;
}

export interface SectorEntity {
  slug: string;
  name: string;
  priceFromCents: number;
}

export interface EventDetailEntity extends EventEntity {
  sectors: SectorEntity[];
}

export interface SuggestLocation {
  city: string;
  state: string;
}

export interface SuggestResult {
  events: EventEntity[];
  locations: SuggestLocation[];
}
