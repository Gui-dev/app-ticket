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

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  inteira: 'Inteira',
  meia: 'Meia',
  vip: 'VIP',
};

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

export const ticketStatusSchema = z.enum(['valid', 'invalid']);
export type TicketStatusDto = z.infer<typeof ticketStatusSchema>;

export const orderTicketSchema = z.object({
  code: z.string().min(1),
  status: ticketStatusSchema,
});
export type OrderTicketDto = z.infer<typeof orderTicketSchema>;

export const orderItemSchema = z.object({
  sectorSlug: z.string().min(1),
  sectorName: z.string().min(1).nullable(),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  ticketType: ticketTypeSchema,
  priceCents: z.number().int().min(0),
  ticket: orderTicketSchema.nullable(),
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

export const eventSummarySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.iso.datetime(),
});

export type EventSummaryDto = z.infer<typeof eventSummarySchema>;

export const orderDetailResponseSchema = z.object({
  order: orderSchema,
  event: eventSummarySchema.nullable(),
});

export type OrderDetailResponse = z.infer<typeof orderDetailResponseSchema>;

export const orderSummarySchema = z.object({
  id: z.uuid(),
  eventSlug: z.string().min(1),
  eventTitle: z.string().min(1),
  eventStartsAt: z.iso.datetime(),
  status: orderStatusSchema,
  subtotalCents: z.number().int().min(0),
  serviceFeeCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  itemCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});

export type OrderSummaryDto = z.infer<typeof orderSummarySchema>;

export const orderListResponseSchema = z.object({
  orders: z.array(orderSummarySchema),
});

export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDatePtBR(isoDate: string): string {
  const formatted = dateFormatter.format(new Date(isoDate));
  const [day, month, year] = formatted.split(' de ');
  return `${day} de ${capitalize(month)}, ${year}`;
}

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100).replace(/\u00a0/g, ' ');
}

export const seatStatusChangeSchema = z.object({
  sectorSlug: z.string().min(1),
  rowLabel: z.string().min(1),
  seatLabel: z.string().min(1),
  status: seatStatusSchema,
});

export const seatAvailabilityMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connected'), eventSlug: z.string().min(1) }),
  z.object({
    type: z.literal('seat_status_changed'),
    eventSlug: z.string().min(1),
    changes: z.array(seatStatusChangeSchema).min(1),
  }),
]);

export type SeatStatusChange = z.infer<typeof seatStatusChangeSchema>;
export type SeatAvailabilityMessage = z.infer<
  typeof seatAvailabilityMessageSchema
>;

export const organizerEventCreateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  categorySlug: z.string().min(1),
  venueSlug: z.string().min(1),
  startsAt: z.iso.datetime(),
});

export type OrganizerEventCreate = z.infer<typeof organizerEventCreateSchema>;

export const organizerVenueCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(60),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
});

export type OrganizerVenueCreate = z.input<typeof organizerVenueCreateSchema>;

export const organizerRowCreateSchema = z.object({
  label: z.string().trim().min(1).max(10),
  seatCount: z.number().int().min(1).max(200),
});

export type OrganizerRowCreate = z.infer<typeof organizerRowCreateSchema>;

export const organizerSectorCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceFromCents: z.number().int().min(0),
  rows: z.array(organizerRowCreateSchema).min(1).max(60),
});

export type OrganizerSectorCreate = z.infer<typeof organizerSectorCreateSchema>;

export const organizerLotCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(0),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export type OrganizerLotCreate = z.infer<typeof organizerLotCreateSchema>;

export const organizerEventDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: categorySchema,
  venue: venueSchema,
  startsAt: z.iso.datetime(),
  priceFromCents: z.number().int().min(0),
  platform: z.boolean(),
});

export type OrganizerEventDto = z.infer<typeof organizerEventDtoSchema>;

export const organizerSeatRowDtoSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  seatCount: z.number().int().min(0),
});

export type OrganizerSeatRowDto = z.infer<typeof organizerSeatRowDtoSchema>;

export const organizerLotDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  priceCents: z.number().int().min(0),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export type OrganizerLotDto = z.infer<typeof organizerLotDtoSchema>;

export const organizerSectorDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  priceFromCents: z.number().int().min(0),
  seatsTotal: z.number().int().min(0),
  rows: z.array(organizerSeatRowDtoSchema),
  lots: z.array(organizerLotDtoSchema),
});

export type OrganizerSectorDto = z.infer<typeof organizerSectorDtoSchema>;

export const organizerEventDetailSchema = organizerEventDtoSchema.extend({
  sectors: z.array(organizerSectorDtoSchema),
});

export type OrganizerEventDetailDto = z.infer<
  typeof organizerEventDetailSchema
>;

export const organizerEventListResponseSchema = z.object({
  events: z.array(organizerEventDtoSchema),
});

export type OrganizerEventListResponse = z.infer<
  typeof organizerEventListResponseSchema
>;

export const organizerVenueDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
});

export type OrganizerVenueDto = z.infer<typeof organizerVenueDtoSchema>;

export const organizerVenueListResponseSchema = z.object({
  venues: z.array(organizerVenueDtoSchema),
});

export type OrganizerVenueListResponse = z.infer<
  typeof organizerVenueListResponseSchema
>;

export const organizerEventResponseSchema = z.object({
  event: organizerEventDtoSchema,
});

export type OrganizerEventResponse = z.infer<
  typeof organizerEventResponseSchema
>;

export const organizerEventDetailResponseSchema = z.object({
  event: organizerEventDetailSchema,
});

export type OrganizerEventDetailResponse = z.infer<
  typeof organizerEventDetailResponseSchema
>;

export const organizerVenueResponseSchema = z.object({
  venue: organizerVenueDtoSchema,
});

export type OrganizerVenueResponse = z.infer<
  typeof organizerVenueResponseSchema
>;

export const organizerSalesReportSchema = z
  .object({
    eventId: z.uuid(),
    from: z.iso.datetime().nullable(),
    to: z.iso.datetime().nullable(),
    ticketsSold: z.number().int().min(0),
    ordersCount: z.number().int().min(0),
    grossCents: z.number().int().min(0),
    platformFeeCents: z.number().int().min(0),
    netCents: z.number().int().min(0),
  })
  .refine(
    (report) => report.netCents === report.grossCents - report.platformFeeCents,
  )
  .refine(
    (report) =>
      report.from === null || report.to === null || report.from < report.to,
  );

export type OrganizerSalesReportDto = z.infer<
  typeof organizerSalesReportSchema
>;

export const organizerSalesReportResponseSchema = z.object({
  report: organizerSalesReportSchema,
});

export type OrganizerSalesReportResponse = z.infer<
  typeof organizerSalesReportResponseSchema
>;

export const organizerSalesReportQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type OrganizerSalesReportQuery = z.input<
  typeof organizerSalesReportQuerySchema
>;

export const organizerTicketValidationRecordSchema = z
  .object({
    result: z.enum(['valid', 'already_used', 'invalid']),
    usedAt: z.iso.datetime().nullable(),
    usedBy: z.string().nullable(),
    sectorName: z.string().nullable(),
    rowLabel: z.string().nullable(),
    seatLabel: z.string().nullable(),
  })
  .refine(
    (record) =>
      record.result !== 'already_used' ||
      (record.usedAt !== null && record.usedBy !== null),
  )
  .refine(
    (record) =>
      record.result === 'already_used' ||
      (record.usedAt === null && record.usedBy === null),
  )
  .refine(
    (record) =>
      record.result !== 'invalid' ||
      (record.sectorName === null &&
        record.rowLabel === null &&
        record.seatLabel === null),
  );

export type OrganizerTicketValidationDto = z.infer<
  typeof organizerTicketValidationRecordSchema
>;

export const organizerTicketValidationResponseSchema = z.object({
  validation: organizerTicketValidationRecordSchema,
});

export type OrganizerTicketValidationResponse = z.infer<
  typeof organizerTicketValidationResponseSchema
>;

export const organizerTicketValidateSchema = z.object({
  code: z.string().min(1),
});

export type OrganizerTicketValidate = z.input<
  typeof organizerTicketValidateSchema
>;
