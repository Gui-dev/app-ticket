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
  slug: z.string().min(1),
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

export const searchFiltersSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const listEventsQuerySchema = searchFiltersSchema.extend({
  view: z.enum(['all', 'featured', 'hot']).optional().default('all'),
});

export type ListEventsQuery = z.input<typeof listEventsQuerySchema>;

export const listEventsResponseSchema = z.object({
  events: z.array(eventSchema),
});

export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

export type EventsView = z.infer<typeof listEventsQuerySchema>['view'];

export const listCategoriesResponseSchema = z.object({
  categories: z.array(categorySchema),
});

export type ListCategoriesResponse = z.infer<
  typeof listCategoriesResponseSchema
>;

export type CategoryDto = z.infer<typeof categorySchema>;

export const sectorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
});

export type SectorDto = z.infer<typeof sectorSchema>;

export const artistSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export type ArtistDto = z.infer<typeof artistSchema>;

export const eventDetailSchema = eventSchema.extend({
  sectors: z.array(sectorSchema),
  artists: z.array(artistSchema),
});

export type EventDetailDto = z.infer<typeof eventDetailSchema>;

export const eventDetailResponseSchema = z.object({
  event: eventDetailSchema,
});

export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>;

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export type SuggestQuery = z.infer<typeof suggestQuerySchema>;

export const suggestEventItemSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.iso.datetime(),
  venueName: z.string().min(1),
  venueCity: z.string().min(1),
  venueState: z.string().length(2),
  priceFromCents: z.number().int().min(0),
});

export type SuggestEventItem = z.infer<typeof suggestEventItemSchema>;

export const suggestLocationItemSchema = z.object({
  city: z.string().min(1),
  state: z.string().length(2),
});

export type SuggestLocationItem = z.infer<typeof suggestLocationItemSchema>;

export const suggestResponseSchema = z.object({
  events: z.array(suggestEventItemSchema),
  locations: z.array(suggestLocationItemSchema),
});

export type SuggestResponse = z.infer<typeof suggestResponseSchema>;

export const artistDetailSchema = artistSchema.extend({
  events: z.array(eventSchema),
});

export type ArtistDetailDto = z.infer<typeof artistDetailSchema>;

export const artistDetailResponseSchema = z.object({
  artist: artistDetailSchema,
});

export type ArtistDetailResponse = z.infer<typeof artistDetailResponseSchema>;

export const venueDetailSchema = venueSchema.extend({
  slug: z.string().min(1),
  events: z.array(eventSchema),
});

export type VenueDetailDto = z.infer<typeof venueDetailSchema>;

export const venueDetailResponseSchema = z.object({
  venue: venueDetailSchema,
});

export type VenueDetailResponse = z.infer<typeof venueDetailResponseSchema>;
