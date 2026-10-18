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
  seatsAvailable: z.number().int().min(0).nullable(),
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

export const seatStatusSchema = z.enum([
  'available',
  'occupied',
  'unavailable',
]);

export type SeatStatus = z.infer<typeof seatStatusSchema>;

export const seatSchema = z.object({
  label: z.string().min(1),
  status: seatStatusSchema,
});

export const seatRowSchema = z.object({
  label: z.string().min(1),
  seats: z.array(seatSchema),
});

export const seatmapSectorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
  rows: z.array(seatRowSchema),
});

export const seatmapSchema = z.object({
  eventSlug: z.string().min(1),
  sectors: z.array(seatmapSectorSchema),
});

export const SEAT_HOLD_TTL_SECONDS = 600;
export const SEAT_HOLD_RENEW_AFTER_SECONDS = 120;

export const holdSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type HoldDto = z.infer<typeof holdSchema>;

export const holdRequestSchema = z.object({
  sectorSlug: z.string().trim().min(1),
  rowLabel: z.string().trim().min(1),
  seatLabel: z.string().trim().min(1),
});

export type HoldRequest = z.infer<typeof holdRequestSchema>;

export const holdResponseSchema = z.object({ hold: holdSchema });

export const releaseResponseSchema = z.object({ released: z.literal(true) });

export const ticketTypeSchema = z.enum(['inteira', 'meia', 'vip']);

export type TicketType = z.infer<typeof ticketTypeSchema>;

export const CART_MAX_ITEMS = 8;

const TICKET_TYPE_MULTIPLIERS: Record<TicketType, number> = {
  inteira: 1,
  meia: 0.5,
  vip: 2,
};

export function ticketPriceCents(type: TicketType, baseCents: number): number {
  return Math.round(baseCents * TICKET_TYPE_MULTIPLIERS[type]);
}

export const cartItemSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  ticketType: ticketTypeSchema,
  priceCents: z.number().int().min(0),
  expiresAt: z.iso.datetime(),
});

export type CartItemDto = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(cartItemSchema),
  expiresAt: z.iso.datetime().nullable(),
  totalCents: z.number().int().min(0),
});

export type CartDto = z.infer<typeof cartSchema>;

export const cartItemRequestSchema = z.object({
  sectorSlug: z.string().trim().min(1),
  rowLabel: z.string().trim().min(1),
  seatLabel: z.string().trim().min(1),
  ticketType: ticketTypeSchema,
});

export type CartItemRequest = z.infer<typeof cartItemRequestSchema>;

export const setCartItemResponseSchema = z.object({
  item: z.object({
    sectorSlug: z.string().min(1),
    rowLabel: z.string().min(1),
    seatLabel: z.string().min(1),
    ticketType: ticketTypeSchema,
  }),
});

export type SetCartItemResponse = z.infer<typeof setCartItemResponseSchema>;

export const seatmapResponseSchema = z.object({
  seatmap: seatmapSchema,
  holds: z.array(holdSchema),
});

export type SeatmapDto = z.infer<typeof seatmapSchema>;

export const bestSeatQuerySchema = z.object({
  sector: z.string().trim().min(1),
});

export const bestSeatSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  priceFromCents: z.number().int().min(0),
});

export const bestSeatResponseSchema = z.object({ seat: bestSeatSchema });

export type BestSeatDto = z.infer<typeof bestSeatSchema>;

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

export const SERVICE_FEE_BPS = 1000;

export function serviceFeeCents(subtotalCents: number): number {
  return Math.round((subtotalCents * SERVICE_FEE_BPS) / 10_000);
}

export function orderTotals(items: { priceCents: number }[]): {
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
} {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  const fee = serviceFeeCents(subtotalCents);
  return {
    subtotalCents,
    serviceFeeCents: fee,
    totalCents: subtotalCents + fee,
  };
}

export const paymentMethodSchema = z.enum(['card', 'boleto']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const orderStatusSchema = z.enum([
  'pending',
  'paid',
  'failed',
  'expired',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderItemSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  ticketType: ticketTypeSchema,
  priceCents: z.number().int().min(0),
});

export type OrderItemDto = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  eventSlug: z.string().min(1),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  subtotalCents: z.number().int().min(0),
  serviceFeeCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  items: z.array(orderItemSchema),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
});

export type OrderDto = z.infer<typeof orderSchema>;

export const createOrderRequestSchema = z.object({
  paymentMethod: paymentMethodSchema,
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const orderPaymentProviderSchema = z.enum(['stripe', 'fake']);

export const orderPaymentSchema = z.object({
  provider: orderPaymentProviderSchema,
  providerRef: z.string().min(1),
  clientSecret: z.string().nullable(),
});

export type OrderPaymentDto = z.infer<typeof orderPaymentSchema>;

export const createOrderResponseSchema = z.object({
  order: orderSchema,
  payment: orderPaymentSchema,
});

export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

export const orderResponseSchema = z.object({ order: orderSchema });

export type OrderResponse = z.infer<typeof orderResponseSchema>;
