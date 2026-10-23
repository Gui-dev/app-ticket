export interface OrganizerEventRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  venueId: string;
  venueSlug: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  startsAt: Date;
  priceFromCents: number;
  organizerId: string | null;
}

export interface OrganizerSectorRecord {
  id: string;
  slug: string;
  name: string;
  priceFromCents: number;
  seatsTotal: number;
  rows: { id: string; label: string; seatCount: number }[];
  lots: {
    id: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }[];
}

export type FindEventForOrganizerResult =
  | { kind: 'ok'; event: OrganizerEventRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export type CreateEventResult =
  | { kind: 'ok'; event: OrganizerEventRecord }
  | { kind: 'category_not_found' }
  | { kind: 'venue_not_found' };

export type UpdateEventResult =
  | { kind: 'ok'; event: OrganizerEventRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'category_not_found' }
  | { kind: 'venue_not_found' };

export type DeleteEventResult = 'ok' | 'not_found' | 'forbidden' | 'has_orders';

export interface OrganizerRepository {
  listEventsForOrganizer(userId: string): Promise<OrganizerEventRecord[]>;
  findEventForOrganizer(input: {
    eventId: string;
    userId: string;
  }): Promise<FindEventForOrganizerResult>;
  createEvent(input: {
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
    organizerId: string;
  }): Promise<CreateEventResult>;
  updateEvent(input: {
    eventId: string;
    userId: string;
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
  }): Promise<UpdateEventResult>;
  deleteEvent(input: {
    eventId: string;
    userId: string;
  }): Promise<DeleteEventResult>;
}
