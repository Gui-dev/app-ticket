import { randomUUID } from 'node:crypto';

import { orderSplit, type TransferStatus } from '@ticketvibe/shared';

import type {
  CreateEventResult,
  CreateRowResult,
  CreateSectorInput,
  CreateSectorResult,
  DeleteEventResult,
  DeleteLotResult,
  FindEventForOrganizerResult,
  FindLotForOrganizerResult,
  OrganizerEventRecord,
  OrganizerLotRecord,
  OrganizerRepository,
  OrganizerSectorRecord,
  OrganizerTransferRecord,
  OrganizerVenueRecord,
  SalesReportForOrganizerResult,
  TicketValidationForOrganizerInput,
  TicketValidationForOrganizerResult,
  UpdateEventResult,
  WriteLotResult,
  WriteSectorResult,
} from '../domain/organizer-repository.js';
import { slugify } from '../domain/slugify.js';

export interface InMemoryOrganizerCategorySeed {
  slug: string;
  name: string;
}

export interface InMemoryOrganizerVenueSeed {
  id?: string;
  slug?: string;
  name: string;
  city: string;
  state: string;
}

export interface InMemoryOrganizerEventSeed {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  categorySlug: string;
  venueSlug: string;
  startsAt: Date;
  organizerId: string | null;
  priceFromCents?: number;
  cancellationWindowHours?: number;
  refundPercent?: number;
}

export interface InMemoryOrganizerLotSeed {
  id?: string;
  name: string;
  priceCents: number;
  startsAt: Date;
  endsAt: Date;
}

export interface InMemoryOrganizerSectorSeed {
  id?: string;
  eventId: string;
  slug?: string;
  name: string;
  priceFromCents?: number;
  rows?: { label: string; seatCount: number; seatIds?: string[] }[];
  lots?: InMemoryOrganizerLotSeed[];
}

export interface InMemoryOrganizerOrderSeed {
  id?: string;
  eventId: string;
  seatIds?: string[];
  status?: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt?: Date;
  serviceFeeCents?: number;
  totalCents?: number;
  createdAt?: Date;
  transferStatus?: TransferStatus;
  items?: { priceCents: number }[];
}

export interface InMemoryOrganizerTicketSeed {
  eventId: string;
  code: string;
  sectorName?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
  usedAt?: Date | null;
  usedBy?: string | null;
}

interface InMemoryOrganizerTicketRecord {
  eventId: string;
  code: string;
  sectorName: string | null;
  rowLabel: string | null;
  seatLabel: string | null;
  usedAt: Date | null;
  usedBy: string | null;
}

interface InMemoryOrganizerOrderRecord {
  id: string;
  eventId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt: Date;
  serviceFeeCents: number;
  totalCents: number;
  createdAt: Date;
  transferStatus: TransferStatus;
  items: { priceCents: number }[];
}

export interface InMemoryOrganizerSeed {
  categories?: InMemoryOrganizerCategorySeed[];
  venues?: InMemoryOrganizerVenueSeed[];
  events?: InMemoryOrganizerEventSeed[];
  sectors?: InMemoryOrganizerSectorSeed[];
  orders?: InMemoryOrganizerOrderSeed[];
  tickets?: InMemoryOrganizerTicketSeed[];
}

interface InMemoryVenueRecord extends OrganizerVenueRecord {}

interface InMemorySeatRecord {
  id: string;
  rowId: string;
  label: string;
  position: number;
}

interface InMemoryRowRecord {
  id: string;
  sectorId: string;
  label: string;
  position: number;
  seats: InMemorySeatRecord[];
}

interface InMemorySectorRecord {
  id: string;
  eventId: string;
  slug: string;
  name: string;
  priceFromCents: number;
  rows: InMemoryRowRecord[];
}

interface InMemoryLotRecord extends OrganizerLotRecord {
  sectorId: string;
}

function cloneRecord(record: OrganizerEventRecord): OrganizerEventRecord {
  return { ...record, startsAt: new Date(record.startsAt) };
}

function cloneLot(lot: InMemoryLotRecord): OrganizerLotRecord {
  return {
    id: lot.id,
    name: lot.name,
    priceCents: lot.priceCents,
    startsAt: new Date(lot.startsAt),
    endsAt: new Date(lot.endsAt),
  };
}

export class InMemoryOrganizerRepository implements OrganizerRepository {
  private readonly categories: Map<string, InMemoryOrganizerCategorySeed>;
  private readonly venues: Map<string, InMemoryVenueRecord>;
  private readonly events: Map<string, OrganizerEventRecord>;
  private readonly sectors: Map<string, InMemorySectorRecord>;
  private readonly lots: Map<string, InMemoryLotRecord>;
  private readonly soldSeatIds: Set<string>;
  private readonly orderCounts: Map<string, number>;
  private readonly orders: InMemoryOrganizerOrderRecord[];
  private readonly tickets: Map<string, InMemoryOrganizerTicketRecord>;
  private nextId = 0;
  private nextSectorId = 0;
  private nextLotId = 0;

  constructor(seed: InMemoryOrganizerSeed = {}) {
    this.categories = new Map(
      (seed.categories ?? []).map((category) => [category.slug, category]),
    );
    this.venues = new Map();
    for (const venue of seed.venues ?? []) {
      const slug = venue.slug ?? slugify(venue.name);
      this.venues.set(slug, {
        id: venue.id ?? randomUUID(),
        slug,
        name: venue.name,
        city: venue.city,
        state: venue.state,
      });
    }
    this.events = new Map();
    for (const event of seed.events ?? []) {
      this.nextId += 1;
      const id = event.id ?? `evt-${this.nextId}`;
      this.events.set(
        id,
        this.buildRecord(id, {
          slug: event.slug ?? slugify(event.title),
          title: event.title,
          description: event.description,
          categorySlug: event.categorySlug,
          venueSlug: event.venueSlug,
          startsAt: new Date(event.startsAt),
          organizerId: event.organizerId,
          priceFromCents: event.priceFromCents ?? 0,
          cancellationWindowHours: event.cancellationWindowHours ?? 24,
          refundPercent: event.refundPercent ?? 100,
        }),
      );
    }
    this.sectors = new Map();
    this.lots = new Map();
    this.soldSeatIds = new Set();
    this.orderCounts = new Map();
    this.orders = [];
    this.tickets = new Map(
      (seed.tickets ?? []).map((ticket) => [
        ticket.code,
        {
          eventId: ticket.eventId,
          code: ticket.code,
          sectorName: ticket.sectorName ?? null,
          rowLabel: ticket.rowLabel ?? null,
          seatLabel: ticket.seatLabel ?? null,
          usedAt: ticket.usedAt ? new Date(ticket.usedAt) : null,
          usedBy: ticket.usedBy ?? null,
        },
      ]),
    );
    this.nextSectorId = seed.sectors?.length ?? 0;
    for (const sector of seed.sectors ?? []) {
      this.sectors.set(
        sector.id ?? this.nextSectorKey(),
        this.buildSectorRecord({
          id: sector.id,
          eventId: sector.eventId,
          slug: sector.slug ?? slugify(sector.name),
          name: sector.name,
          priceFromCents: sector.priceFromCents ?? 0,
          rows: sector.rows ?? [],
          lots: sector.lots ?? [],
        }),
      );
    }
    for (const order of seed.orders ?? []) {
      const items = order.items ?? [{ priceCents: 0 }];
      const paidAt = order.paidAt ? new Date(order.paidAt) : new Date();
      const serviceFeeCents =
        order.serviceFeeCents ??
        Math.round(
          items.reduce((total, item) => total + item.priceCents, 0) * 0.1,
        );
      this.orders.push({
        id: order.id ?? randomUUID(),
        eventId: order.eventId,
        status: order.status ?? 'paid',
        paidAt,
        serviceFeeCents,
        totalCents:
          order.totalCents ??
          items.reduce((total, item) => total + item.priceCents, 0) +
            serviceFeeCents,
        createdAt: order.createdAt ? new Date(order.createdAt) : paidAt,
        transferStatus: order.transferStatus ?? 'none',
        items,
      });
      for (const seatId of order.seatIds ?? []) {
        this.soldSeatIds.add(seatId);
      }
      this.orderCounts.set(
        order.eventId,
        (this.orderCounts.get(order.eventId) ?? 0) + 1,
      );
    }
  }

  private nextSectorKey(): string {
    this.nextSectorId += 1;
    return `sector-${this.nextSectorId}`;
  }

  private nextLotKey(): string {
    this.nextLotId += 1;
    return `lot-${this.nextLotId}`;
  }

  private buildSectorRecord(input: {
    id?: string;
    eventId: string;
    slug: string;
    name: string;
    priceFromCents: number;
    rows: { label: string; seatCount: number; seatIds?: string[] }[];
    lots: InMemoryOrganizerLotSeed[];
  }): InMemorySectorRecord {
    const id = input.id ?? this.nextSectorKey();
    const rows: InMemoryRowRecord[] = [];
    input.rows.forEach((row, index) => {
      const rowId = randomUUID();
      const seats = Array.from({ length: row.seatCount }, (_, seatIndex) => ({
        id: row.seatIds?.[seatIndex] ?? randomUUID(),
        rowId,
        label: String(seatIndex + 1),
        position: seatIndex + 1,
      }));
      rows.push({
        id: rowId,
        sectorId: id,
        label: row.label,
        position: index + 1,
        seats,
      });
    });
    for (const lot of input.lots) {
      this.nextLotId += 1;
      const lotId = lot.id ?? this.nextLotKey();
      this.lots.set(lotId, {
        id: lotId,
        sectorId: id,
        name: lot.name,
        priceCents: lot.priceCents,
        startsAt: new Date(lot.startsAt),
        endsAt: new Date(lot.endsAt),
      });
    }
    return {
      id,
      eventId: input.eventId,
      slug: input.slug,
      name: input.name,
      priceFromCents: input.priceFromCents,
      rows,
    };
  }

  private toSectorRecord(sector: InMemorySectorRecord): OrganizerSectorRecord {
    return {
      id: sector.id,
      slug: sector.slug,
      name: sector.name,
      priceFromCents: sector.priceFromCents,
      seatsTotal: sector.rows.reduce(
        (total, row) => total + row.seats.length,
        0,
      ),
      rows: [...sector.rows]
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((row) => ({
          id: row.id,
          label: row.label,
          seatCount: row.seats.length,
        })),
      lots: [...this.lots.values()]
        .filter((lot) => lot.sectorId === sector.id)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(cloneLot),
    };
  }

  async listEventsForOrganizer(
    userId: string,
  ): Promise<OrganizerEventRecord[]> {
    return [...this.events.values()]
      .filter(
        (event) => event.organizerId === null || event.organizerId === userId,
      )
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map(cloneRecord);
  }

  async findEventForOrganizer(input: {
    eventId: string;
    userId: string;
  }): Promise<FindEventForOrganizerResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return { kind: 'not_found' };
    }
    return this.checkOwnership(event, input.userId);
  }

  async createEvent(input: {
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
    cancellationWindowHours?: number;
    refundPercent?: number;
    organizerId: string;
  }): Promise<CreateEventResult> {
    if (!this.categories.has(input.categorySlug)) {
      return { kind: 'category_not_found' };
    }
    if (!this.venues.has(input.venueSlug)) {
      return { kind: 'venue_not_found' };
    }
    const slug = this.uniqueSlug(slugify(input.title));
    const id = randomUUID();
    const record = this.buildRecord(id, {
      slug,
      title: input.title,
      description: input.description,
      categorySlug: input.categorySlug,
      venueSlug: input.venueSlug,
      startsAt: new Date(input.startsAt),
      organizerId: input.organizerId,
      priceFromCents: 0,
      cancellationWindowHours: input.cancellationWindowHours ?? 24,
      refundPercent: input.refundPercent ?? 100,
    });
    this.events.set(id, record);
    return { kind: 'ok', event: cloneRecord(record) };
  }

  async updateEvent(input: {
    eventId: string;
    userId: string;
    title: string;
    description: string;
    categorySlug: string;
    venueSlug: string;
    startsAt: Date;
    cancellationWindowHours?: number;
    refundPercent?: number;
  }): Promise<UpdateEventResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    if (!this.categories.has(input.categorySlug)) {
      return { kind: 'category_not_found' };
    }
    if (!this.venues.has(input.venueSlug)) {
      return { kind: 'venue_not_found' };
    }
    const updated = this.buildRecord(event.id, {
      slug: event.slug,
      title: input.title,
      description: input.description,
      categorySlug: input.categorySlug,
      venueSlug: input.venueSlug,
      startsAt: new Date(input.startsAt),
      organizerId: event.organizerId,
      priceFromCents: event.priceFromCents,
      cancellationWindowHours: input.cancellationWindowHours ?? 24,
      refundPercent: input.refundPercent ?? 100,
    });
    this.events.set(event.id, updated);
    return { kind: 'ok', event: cloneRecord(updated) };
  }

  async deleteEvent(input: {
    eventId: string;
    userId: string;
  }): Promise<DeleteEventResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return 'not_found';
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return 'forbidden';
    }
    if ((this.orderCounts.get(input.eventId) ?? 0) > 0) {
      return 'has_orders';
    }
    for (const [sectorId, sector] of this.sectors) {
      if (sector.eventId === input.eventId) {
        for (const [lotId, lot] of this.lots) {
          if (lot.sectorId === sectorId) {
            this.lots.delete(lotId);
          }
        }
        this.sectors.delete(sectorId);
      }
    }
    this.events.delete(input.eventId);
    this.orderCounts.delete(input.eventId);
    return 'ok';
  }

  private sectorHasSale(sector: InMemorySectorRecord): boolean {
    return sector.rows.some((row) =>
      row.seats.some((seat) => this.soldSeatIds.has(seat.id)),
    );
  }

  private rowHasSale(row: InMemoryRowRecord): boolean {
    return row.seats.some((seat) => this.soldSeatIds.has(seat.id));
  }

  async listVenues(): Promise<OrganizerVenueRecord[]> {
    return [...this.venues.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug),
    );
  }

  async findVenue(venueId: string): Promise<OrganizerVenueRecord | null> {
    const venue = [...this.venues.values()].find(
      (candidate) => candidate.id === venueId,
    );
    return venue ? { ...venue } : null;
  }

  async createVenue(input: {
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord> {
    const slug = this.uniqueVenueSlug(slugify(input.name));
    const venue: InMemoryVenueRecord = {
      id: randomUUID(),
      slug,
      name: input.name,
      city: input.city,
      state: input.state,
    };
    this.venues.set(slug, venue);
    return { ...venue };
  }

  async updateVenue(input: {
    venueId: string;
    name: string;
    city: string;
    state: string;
  }): Promise<OrganizerVenueRecord | null> {
    const venue = [...this.venues.values()].find(
      (candidate) => candidate.id === input.venueId,
    );
    if (!venue) {
      return null;
    }
    const updated = {
      ...venue,
      name: input.name,
      city: input.city,
      state: input.state,
    };
    this.venues.set(venue.slug, updated);
    return { ...updated };
  }

  async listSectorsForEvent(eventId: string): Promise<OrganizerSectorRecord[]> {
    return [...this.sectors.values()]
      .filter((sector) => sector.eventId === eventId)
      .sort(
        (a, b) =>
          a.priceFromCents - b.priceFromCents || a.slug.localeCompare(b.slug),
      )
      .map((sector) => this.toSectorRecord(sector));
  }

  async createSector(input: CreateSectorInput): Promise<CreateSectorResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    const slug = this.uniqueSectorSlug(input.eventId, slugify(input.name));
    if (slug === null) {
      return { kind: 'sector_conflict' };
    }
    const sector = this.buildSectorRecord({
      eventId: input.eventId,
      slug,
      name: input.name,
      priceFromCents: input.priceFromCents,
      rows: input.rows,
      lots: [],
    });
    this.sectors.set(sector.id, sector);
    this.recalculateEventPrice(input.eventId);
    return { kind: 'ok', sector: this.toSectorRecord(sector) };
  }

  async deleteSector(input: {
    sectorId: string;
    userId: string;
  }): Promise<WriteSectorResult> {
    const sector = this.sectors.get(input.sectorId);
    if (!sector) {
      return 'not_found';
    }
    const write = this.resolveWriter(sector.eventId, input.userId);
    if (write !== 'ok') return write;
    if (this.sectorHasSale(sector)) {
      return 'has_orders';
    }
    for (const [lotId, lot] of this.lots) {
      if (lot.sectorId === input.sectorId) {
        this.lots.delete(lotId);
      }
    }
    this.sectors.delete(input.sectorId);
    this.recalculateEventPrice(sector.eventId);
    return 'ok';
  }

  async createRow(input: {
    sectorId: string;
    userId: string;
    label: string;
    seatCount: number;
  }): Promise<CreateRowResult> {
    const sector = this.sectors.get(input.sectorId);
    if (!sector) {
      return { kind: 'not_found' };
    }
    const writer = this.resolveWriter(sector.eventId, input.userId);
    if (writer !== 'ok') return { kind: writer };
    if (sector.rows.some((row) => row.label === input.label)) {
      return { kind: 'label_conflict' };
    }
    const rowId = randomUUID();
    const position =
      sector.rows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
    sector.rows.push({
      id: rowId,
      sectorId: sector.id,
      label: input.label,
      position,
      seats: Array.from({ length: input.seatCount }, (_, seatIndex) => ({
        id: randomUUID(),
        rowId,
        label: String(seatIndex + 1),
        position: seatIndex + 1,
      })),
    });
    return { kind: 'ok', sector: this.toSectorRecord(sector) };
  }

  async deleteRow(input: {
    rowId: string;
    userId: string;
  }): Promise<WriteSectorResult> {
    const [row, sector] = this.findRow(input.rowId);
    if (!row || !sector) {
      return 'not_found';
    }
    const write = this.resolveWriter(sector.eventId, input.userId);
    if (write !== 'ok') return write;
    if (this.rowHasSale(row)) {
      return 'has_orders';
    }
    sector.rows = sector.rows.filter((candidate) => candidate.id !== row.id);
    return 'ok';
  }

  async recalculateEventPriceFrom(eventId: string): Promise<void> {
    this.recalculateEventPrice(eventId);
  }

  async listLotsBySector(sectorId: string): Promise<OrganizerLotRecord[]> {
    return [...this.lots.values()]
      .filter((lot) => lot.sectorId === sectorId)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(cloneLot);
  }

  async findLotForOrganizer(input: {
    lotId: string;
    userId: string;
  }): Promise<FindLotForOrganizerResult> {
    const lot = this.lots.get(input.lotId);
    if (!lot) {
      return { kind: 'not_found' };
    }
    const sector = this.sectors.get(lot.sectorId);
    if (!sector) {
      return { kind: 'not_found' };
    }
    const writer = this.resolveWriter(sector.eventId, input.userId);
    if (writer !== 'ok') return { kind: writer };
    return { kind: 'ok', lot: { ...cloneLot(lot), sectorId: lot.sectorId } };
  }

  async createLot(input: {
    sectorId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult> {
    const sector = this.sectors.get(input.sectorId);
    if (!sector) {
      return { kind: 'not_found' };
    }
    const writer = this.resolveWriter(sector.eventId, input.userId);
    if (writer !== 'ok') return { kind: writer };
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { kind: 'invalid_period' };
    }
    if (this.findOverlappingLot(sector.id, startsAt, endsAt, null)) {
      return { kind: 'overlapping' };
    }
    const lot: InMemoryLotRecord = {
      id: this.nextLotKey(),
      sectorId: sector.id,
      name: input.name,
      priceCents: input.priceCents,
      startsAt,
      endsAt,
    };
    this.lots.set(lot.id, lot);
    this.recalculateEventPrice(sector.eventId);
    return { kind: 'ok', lot: cloneLot(lot) };
  }

  async updateLot(input: {
    lotId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult> {
    const lot = this.lots.get(input.lotId);
    if (!lot) {
      return { kind: 'not_found' };
    }
    const sector = this.sectors.get(lot.sectorId);
    if (!sector) {
      return { kind: 'not_found' };
    }
    const writer = this.resolveWriter(sector.eventId, input.userId);
    if (writer !== 'ok') return { kind: writer };
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { kind: 'invalid_period' };
    }
    if (this.findOverlappingLot(sector.id, startsAt, endsAt, lot.id)) {
      return { kind: 'overlapping' };
    }
    const updated: InMemoryLotRecord = {
      ...lot,
      name: input.name,
      priceCents: input.priceCents,
      startsAt,
      endsAt,
    };
    this.lots.set(lot.id, updated);
    this.recalculateEventPrice(sector.eventId);
    return { kind: 'ok', lot: cloneLot(updated) };
  }

  async deleteLot(input: {
    lotId: string;
    userId: string;
  }): Promise<DeleteLotResult> {
    const lot = this.lots.get(input.lotId);
    if (!lot) {
      return 'not_found';
    }
    const sector = this.sectors.get(lot.sectorId);
    if (!sector) {
      return 'not_found';
    }
    const writer = this.resolveWriter(sector.eventId, input.userId);
    if (writer !== 'ok') return writer;
    this.lots.delete(lot.id);
    this.recalculateEventPrice(sector.eventId);
    return 'ok';
  }

  async salesReportForOrganizer(input: {
    eventId: string;
    userId: string;
    from: Date | null;
    to: Date | null;
  }): Promise<SalesReportForOrganizerResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    const paid = this.orders.filter(
      (order) =>
        order.eventId === input.eventId &&
        order.status === 'paid' &&
        (input.from === null ||
          order.paidAt.getTime() >= input.from.getTime()) &&
        (input.to === null || order.paidAt.getTime() < input.to.getTime()),
    );
    const ticketsSold = paid.reduce(
      (total, order) => total + order.items.length,
      0,
    );
    const grossCents = paid.reduce(
      (total, order) =>
        total + order.items.reduce((sum, item) => sum + item.priceCents, 0),
      0,
    );
    const platformFeeCents = paid.reduce(
      (total, order) => total + order.serviceFeeCents,
      0,
    );
    return {
      kind: 'ok',
      report: {
        eventId: input.eventId,
        ticketsSold,
        ordersCount: paid.length,
        grossCents,
        platformFeeCents,
        netCents: grossCents - platformFeeCents,
      },
    };
  }

  async listOrderTransfers(
    organizerId: string,
  ): Promise<OrganizerTransferRecord[]> {
    return this.orders
      .map((order) => ({ order, event: this.events.get(order.eventId) }))
      .filter(
        (
          row,
        ): row is {
          order: InMemoryOrganizerOrderRecord;
          event: OrganizerEventRecord;
        } =>
          row.event !== undefined &&
          row.event.organizerId === organizerId &&
          row.order.status === 'paid',
      )
      .sort(
        (a, b) =>
          b.order.createdAt.getTime() - a.order.createdAt.getTime() ||
          a.order.id.localeCompare(b.order.id),
      )
      .map(({ order, event }) => ({
        orderId: order.id,
        eventTitle: event.title,
        eventSlug: event.slug,
        ...orderSplit({
          totalCents: order.totalCents,
          serviceFeeCents: order.serviceFeeCents,
        }),
        transferStatus: order.transferStatus,
        createdAt: new Date(order.createdAt),
      }));
  }

  async validateTicketForOrganizer(
    input: TicketValidationForOrganizerInput,
  ): Promise<TicketValidationForOrganizerResult> {
    const event = this.events.get(input.eventId);
    if (!event) {
      return { kind: 'not_found' };
    }
    if (event.organizerId === null || event.organizerId !== input.userId) {
      return { kind: 'forbidden' };
    }
    const ticket = this.tickets.get(input.code);
    if (!ticket || ticket.eventId !== input.eventId) {
      return { kind: 'invalid' };
    }
    if (ticket.usedAt !== null) {
      return {
        kind: 'ok',
        record: {
          result: 'already_used',
          usedAt: new Date(ticket.usedAt),
          usedBy: ticket.usedBy,
          sectorName: ticket.sectorName,
          rowLabel: ticket.rowLabel,
          seatLabel: ticket.seatLabel,
        },
      };
    }
    ticket.usedAt = new Date();
    ticket.usedBy = input.userId;
    return {
      kind: 'ok',
      record: {
        result: 'valid',
        usedAt: null,
        usedBy: null,
        sectorName: ticket.sectorName,
        rowLabel: ticket.rowLabel,
        seatLabel: ticket.seatLabel,
      },
    };
  }

  private findOverlappingLot(
    sectorId: string,
    startsAt: Date,
    endsAt: Date,
    excludedLotId: string | null,
  ): InMemoryLotRecord | null {
    for (const lot of this.lots.values()) {
      if (lot.sectorId !== sectorId || lot.id === excludedLotId) continue;
      if (
        lot.startsAt.getTime() < endsAt.getTime() &&
        lot.endsAt.getTime() > startsAt.getTime()
      ) {
        return lot;
      }
    }
    return null;
  }

  private recalculateEventPrice(eventId: string): void {
    const event = this.events.get(eventId);
    if (!event) return;
    const prices = [...this.sectors.values()]
      .filter((sector) => sector.eventId === eventId)
      .map((sector) => this.effectiveSectorPrice(sector));
    if (prices.length === 0) return;
    this.events.set(eventId, {
      ...event,
      priceFromCents: Math.min(...prices),
    });
  }

  private effectiveSectorPrice(sector: InMemorySectorRecord): number {
    const nowMs = Date.now();
    const active = [...this.lots.values()]
      .filter(
        (lot) =>
          lot.sectorId === sector.id &&
          lot.startsAt.getTime() <= nowMs &&
          lot.endsAt.getTime() > nowMs,
      )
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    return active[0]?.priceCents ?? sector.priceFromCents;
  }

  private findRow(
    rowId: string,
  ): [row: InMemoryRowRecord | null, sector: InMemorySectorRecord | null] {
    for (const sector of this.sectors.values()) {
      const row = sector.rows.find((candidate) => candidate.id === rowId);
      if (row) return [row, sector];
    }
    return [null, null];
  }

  private resolveWriter(
    eventId: string,
    userId: string,
  ): 'ok' | 'not_found' | 'forbidden' {
    const event = this.events.get(eventId);
    if (!event) return 'not_found';
    if (event.organizerId === null || event.organizerId !== userId) {
      return 'forbidden';
    }
    return 'ok';
  }

  private uniqueSectorSlug(eventId: string, base: string): string | null {
    const stem = base === '' ? 'setor' : base;
    const taken = new Set(
      [...this.sectors.values()]
        .filter((sector) => sector.eventId === eventId)
        .map((sector) => sector.slug),
    );
    if (!taken.has(stem)) return stem;
    return null;
  }

  private checkOwnership(
    event: OrganizerEventRecord,
    userId: string,
  ): FindEventForOrganizerResult {
    if (event.organizerId !== null && event.organizerId !== userId) {
      return { kind: 'forbidden' };
    }
    return { kind: 'ok', event: cloneRecord(event) };
  }

  private uniqueSlug(base: string): string {
    const stem = base === '' ? 'evento' : base;
    const taken = new Set([...this.events.values()].map((event) => event.slug));
    let candidate = stem;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${stem}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private uniqueVenueSlug(base: string): string {
    const stem = base === '' ? 'local' : base;
    const taken = new Set(this.venues.keys());
    let candidate = stem;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${stem}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private buildRecord(
    id: string,
    input: {
      slug: string;
      title: string;
      description: string;
      categorySlug: string;
      venueSlug: string;
      startsAt: Date;
      organizerId: string | null;
      priceFromCents: number;
      cancellationWindowHours: number;
      refundPercent: number;
    },
  ): OrganizerEventRecord {
    const category = this.categories.get(input.categorySlug);
    if (!category) {
      throw new Error(`Unknown category "${input.categorySlug}"`);
    }
    const venue = this.venues.get(input.venueSlug);
    if (!venue) {
      throw new Error(`Unknown venue "${input.venueSlug}"`);
    }
    return {
      id,
      slug: input.slug,
      title: input.title,
      description: input.description,
      categoryId: `category-${category.slug}`,
      categorySlug: category.slug,
      categoryName: category.name,
      venueId: venue.id,
      venueSlug: venue.slug,
      venueName: venue.name,
      venueCity: venue.city,
      venueState: venue.state,
      startsAt: input.startsAt,
      priceFromCents: input.priceFromCents,
      cancellationWindowHours: input.cancellationWindowHours,
      refundPercent: input.refundPercent,
      organizerId: input.organizerId,
    };
  }
}
