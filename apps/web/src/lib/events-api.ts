import 'server-only';

import {
  type CategoryDto,
  type EventDetailDto,
  type EventDto,
  eventDetailResponseSchema,
  type ListEventsQuery,
  listCategoriesResponseSchema,
  listEventsResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { EventDetailDto, EventDto };

export type FetchEventsResult =
  | { ok: true; events: EventDto[] }
  | { ok: false; error: string };

export type FetchCategoriesResult =
  | { ok: true; categories: CategoryDto[] }
  | { ok: false; error: string };

function buildQuery(query: ListEventsQuery): string {
  const params = new URLSearchParams();

  if (query.view && query.view !== 'all') params.set('view', query.view);
  for (const key of ['q', 'category', 'state', 'from', 'to'] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function fetchEvents(
  query: ListEventsQuery = {},
): Promise<FetchEventsResult> {
  try {
    const response = await fetch(`${API_URL}/events${buildQuery(query)}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, error: `Unexpected status ${response.status}` };
    }
    const payload = listEventsResponseSchema.parse(await response.json());
    return { ok: true, events: payload.events };
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return { ok: false, error: 'request_failed' };
  }
}

export async function fetchEventBySlug(
  slug: string,
): Promise<EventDetailDto | null> {
  try {
    const response = await fetch(`${API_URL}/events/${slug}`, {
      cache: 'no-store',
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = eventDetailResponseSchema.parse(await response.json());
    return payload.event;
  } catch (error) {
    console.error('Failed to fetch event:', error);
    throw error;
  }
}

export async function fetchCategories(): Promise<FetchCategoriesResult> {
  try {
    const response = await fetch(`${API_URL}/categories`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return { ok: false, error: `Unexpected status ${response.status}` };
    }
    const payload = listCategoriesResponseSchema.parse(await response.json());
    return { ok: true, categories: payload.categories };
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return { ok: false, error: 'request_failed' };
  }
}
