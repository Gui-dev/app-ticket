import type { EventEntity } from '../../events/domain/event-entity.js';

export interface VenueDetailEntity {
  slug: string;
  name: string;
  city: string;
  state: string;
  events: EventEntity[];
}
