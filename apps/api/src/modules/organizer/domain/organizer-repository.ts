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

export interface OrganizerLotRecord {
  id: string;
  name: string;
  priceCents: number;
  startsAt: Date;
  endsAt: Date;
}

export type FindLotForOrganizerResult =
  | { kind: 'ok'; lot: OrganizerLotRecord & { sectorId: string } }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export type WriteLotResult =
  | { kind: 'ok'; lot: OrganizerLotRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'overlapping' }
  | { kind: 'invalid_period' };

export type DeleteLotResult = 'ok' | 'not_found' | 'forbidden';

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

export interface OrganizerVenueRecord {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
}

export interface CreateSectorInput {
  eventId: string;
  userId: string;
  name: string;
  priceFromCents: number;
  rows: { label: string; seatCount: number }[];
}

export type CreateSectorResult =
  | { kind: 'ok'; sector: OrganizerSectorRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'sector_conflict' }
  | { kind: 'label_conflict' };

export type CreateRowResult =
  | { kind: 'ok'; sector: OrganizerSectorRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'label_conflict' };

export type WriteSectorResult = 'ok' | 'not_found' | 'forbidden' | 'has_orders';

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
  listVenues(): Promise<OrganizerVenueRecord[]>;
  findVenue(venueId: string): Promise<OrganizerVenueRecord | null>;
  createVenue(input: {
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord>;
  updateVenue(input: {
    venueId: string;
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord | null>;
  listSectorsForEvent(eventId: string): Promise<OrganizerSectorRecord[]>;
  createSector(input: CreateSectorInput): Promise<CreateSectorResult>;
  deleteSector(input: {
    sectorId: string;
    userId: string;
  }): Promise<WriteSectorResult>;
  createRow(input: {
    sectorId: string;
    userId: string;
    label: string;
    seatCount: number;
  }): Promise<CreateRowResult>;
  deleteRow(input: {
    rowId: string;
    userId: string;
  }): Promise<WriteSectorResult>;
  recalculateEventPriceFrom(eventId: string): Promise<void>;
  listLotsBySector(sectorId: string): Promise<OrganizerLotRecord[]>;
  findLotForOrganizer(input: {
    lotId: string;
    userId: string;
  }): Promise<FindLotForOrganizerResult>;
  createLot(input: {
    sectorId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult>;
  updateLot(input: {
    lotId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult>;
  deleteLot(input: { lotId: string; userId: string }): Promise<DeleteLotResult>;
}
