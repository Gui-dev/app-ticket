import type { EventEntity } from '../../events/domain/event-entity.js';

export interface ArtistDetailEntity {
  slug: string;
  name: string;
  events: EventEntity[];
}
