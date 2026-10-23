import { randomUUID } from 'node:crypto';

import type {
  CreateEventResult,
  DeleteEventResult,
  FindEventForOrganizerResult,
  OrganizerEventRecord,
  OrganizerRepository,
  UpdateEventResult,
} from '../domain/organizer-repository.js';
import { slugify } from '../domain/slugify.js';

export interface InMemoryOrganizerCategorySeed {
  slug: string;
  name: string;
}

export interface InMemoryOrganizerVenueSeed {
  slug: string;
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
}

export interface InMemoryOrganizerOrderSeed {
  eventId: string;
}

export interface InMemoryOrganizerSeed {
  categories?: InMemoryOrganizerCategorySeed[];
  venues?: InMemoryOrganizerVenueSeed[];
  events?: InMemoryOrganizerEventSeed[];
  orders?: InMemoryOrganizerOrderSeed[];
}

function cloneRecord(record: OrganizerEventRecord): OrganizerEventRecord {
  return { ...record, startsAt: new Date(record.startsAt) };
}

export class InMemoryOrganizerRepository implements OrganizerRepository {
  private readonly categories: Map<string, InMemoryOrganizerCategorySeed>;
  private readonly venues: Map<string, InMemoryOrganizerVenueSeed>;
  private readonly events: Map<string, OrganizerEventRecord>;
  private readonly orderCounts: Map<string, number>;
  private nextId = 0;

  constructor(seed: InMemoryOrganizerSeed = {}) {
    this.categories = new Map(
      (seed.categories ?? []).map((category) => [category.slug, category]),
    );
    this.venues = new Map(
      (seed.venues ?? []).map((venue) => [venue.slug, venue]),
    );
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
        }),
      );
    }
    this.orderCounts = new Map();
    for (const order of seed.orders ?? []) {
      this.orderCounts.set(
        order.eventId,
        (this.orderCounts.get(order.eventId) ?? 0) + 1,
      );
    }
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
      venueId: `venue-${venue.slug}`,
      venueSlug: venue.slug,
      venueName: venue.name,
      venueCity: venue.city,
      venueState: venue.state,
      startsAt: input.startsAt,
      priceFromCents: input.priceFromCents,
      organizerId: input.organizerId,
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
    this.events.delete(input.eventId);
    this.orderCounts.delete(input.eventId);
    return 'ok';
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
}
