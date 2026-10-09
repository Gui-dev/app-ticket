import 'server-only';

import {
  type EventDto,
  type EventsView,
  listEventsResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { EventDto };

export async function fetchEvents(view: EventsView): Promise<EventDto[]> {
  try {
    const response = await fetch(`${API_URL}/events?view=${view}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Unexpected status ${response.status}`);
    const payload = listEventsResponseSchema.parse(await response.json());
    return payload.events;
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return [];
  }
}
