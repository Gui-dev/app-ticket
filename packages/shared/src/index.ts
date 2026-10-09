import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const venueSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
});

export const eventSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: categorySchema,
  venue: venueSchema,
  startsAt: z.iso.datetime(),
  priceFromCents: z.number().int().min(0),
  imageUrl: z.string().nullable(),
  badgeLabel: z.string().nullable(),
});

export type EventDto = z.infer<typeof eventSchema>;

export const listEventsQuerySchema = z.object({
  view: z.enum(['all', 'featured', 'hot']).optional().default('all'),
});

export type ListEventsQuery = z.input<typeof listEventsQuerySchema>;

export const listEventsResponseSchema = z.object({
  events: z.array(eventSchema),
});

export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

export type EventsView = z.infer<typeof listEventsQuerySchema>['view'];
