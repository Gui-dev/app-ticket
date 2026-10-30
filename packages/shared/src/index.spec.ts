import { describe, expect, it } from 'vitest';
import {
  artistDetailResponseSchema,
  artistDetailSchema,
  bestSeatQuerySchema,
  bestSeatResponseSchema,
  CART_MAX_ITEMS,
  cartItemRequestSchema,
  cartSchema,
  createOrderRequestSchema,
  createOrderResponseSchema,
  eventDetailResponseSchema,
  eventDetailSchema,
  eventSchema,
  formatBRL,
  formatDatePtBR,
  healthResponseSchema,
  holdRequestSchema,
  holdResponseSchema,
  listCategoriesResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  orderDetailResponseSchema,
  orderItemSchema,
  orderListResponseSchema,
  orderPaymentSchema,
  orderSchema,
  orderSplit,
  orderStatusSchema,
  orderTotals,
  organizerConnectResponseSchema,
  organizerConnectStatusSchema,
  organizerEventCreateSchema,
  organizerEventDetailResponseSchema,
  organizerEventDetailSchema,
  organizerEventDtoSchema,
  organizerEventListResponseSchema,
  organizerEventResponseSchema,
  organizerLotCreateSchema,
  organizerLotDtoSchema,
  organizerRowCreateSchema,
  organizerSalesReportQuerySchema,
  organizerSalesReportResponseSchema,
  organizerSalesReportSchema,
  organizerSeatRowDtoSchema,
  organizerSectorCreateSchema,
  organizerSectorDtoSchema,
  organizerTicketValidateSchema,
  organizerTicketValidationRecordSchema,
  organizerTicketValidationResponseSchema,
  organizerTransferEntrySchema,
  organizerTransfersResponseSchema,
  organizerVenueCreateSchema,
  organizerVenueListResponseSchema,
  organizerVenueResponseSchema,
  releaseResponseSchema,
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  SEAT_HOLD_TTL_SECONDS,
  SERVICE_FEE_BPS,
  searchFiltersSchema,
  seatAvailabilityMessageSchema,
  seatmapResponseSchema,
  sectorSchema,
  serviceFeeCents,
  setCartItemResponseSchema,
  suggestQuerySchema,
  suggestResponseSchema,
  TICKET_TYPE_LABELS,
  ticketPriceCents,
  transferStatusSchema,
  venueDetailResponseSchema,
  venueDetailSchema,
} from './index';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({
      status: 'ok',
    });
  });

  it('rejects a payload that is not ok', () => {
    expect(() => healthResponseSchema.parse({ status: 'down' })).toThrow();
  });
});

const validEvent = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  description: 'A night of rock music.',
  category: { slug: 'music', name: 'Music' },
  venue: {
    slug: 'audio-club',
    name: 'Audio Club',
    city: 'São Paulo',
    state: 'SP',
  },
  startsAt: '2026-11-10T20:00:00.000Z',
  priceFromCents: 8000,
  imageUrl: 'https://example.com/image.jpg',
  badgeLabel: 'Popular',
};

describe('eventSchema', () => {
  it('accepts a complete valid event', () => {
    expect(eventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it('rejects an id that is not a uuid', () => {
    expect(() =>
      eventSchema.parse({ ...validEvent, id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects an event without a venue', () => {
    const { venue: _venue, ...withoutVenue } = validEvent;
    expect(() => eventSchema.parse(withoutVenue)).toThrow();
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      eventSchema.parse({ ...validEvent, priceFromCents: -1 }),
    ).toThrow();
  });

  it('accepts null imageUrl and badgeLabel', () => {
    const withoutImages = { ...validEvent, imageUrl: null, badgeLabel: null };
    expect(eventSchema.parse(withoutImages)).toEqual(withoutImages);
  });
});

describe('listEventsQuerySchema', () => {
  it('accepts an empty object and defaults view to all', () => {
    expect(listEventsQuerySchema.parse({})).toEqual({ view: 'all' });
  });

  it('accepts each supported view', () => {
    for (const view of ['all', 'featured', 'hot'] as const) {
      expect(listEventsQuerySchema.parse({ view })).toEqual({ view });
    }
  });

  it('rejects an unknown view', () => {
    expect(() => listEventsQuerySchema.parse({ view: 'unknown' })).toThrow();
  });

  it('keeps the search filters alongside the view', () => {
    expect(
      listEventsQuerySchema.parse({
        view: 'hot',
        q: '  fantasma ',
        category: 'shows',
        state: 'sp',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual({
      view: 'hot',
      q: 'fantasma',
      category: 'shows',
      state: 'SP',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
});

describe('searchFiltersSchema', () => {
  it('trims the query and uppercases the state', () => {
    expect(searchFiltersSchema.parse({ q: ' teatro ', state: 'rj' })).toEqual({
      q: 'teatro',
      state: 'RJ',
    });
  });

  it('accepts an empty object (no filters)', () => {
    expect(searchFiltersSchema.parse({})).toEqual({});
  });

  it('rejects an empty query', () => {
    expect(() => searchFiltersSchema.parse({ q: '   ' })).toThrow();
  });

  it('rejects a state that is not two letters', () => {
    expect(() => searchFiltersSchema.parse({ state: 'XYZ' })).toThrow();
  });

  it('rejects a date that is not ISO yyyy-mm-dd', () => {
    expect(() => searchFiltersSchema.parse({ from: '01/11/2026' })).toThrow();
  });
});

describe('listCategoriesResponseSchema', () => {
  it('accepts a list of categories', () => {
    const payload = { categories: [{ slug: 'shows', name: 'Shows' }] };
    expect(listCategoriesResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a category without a name', () => {
    expect(() =>
      listCategoriesResponseSchema.parse({ categories: [{ slug: 'shows' }] }),
    ).toThrow();
  });
});

describe('listEventsResponseSchema', () => {
  it('accepts a response with a valid event', () => {
    expect(listEventsResponseSchema.parse({ events: [validEvent] })).toEqual({
      events: [validEvent],
    });
  });

  it('rejects a response whose event violates eventSchema', () => {
    expect(() =>
      listEventsResponseSchema.parse({
        events: [{ ...validEvent, priceFromCents: -1 }],
      }),
    ).toThrow();
  });
});

const validSector = {
  slug: 'plateia',
  name: 'Plateia',
  priceFromCents: 12000,
  seatsAvailable: 91,
};

describe('sectorSchema', () => {
  it('accepts a valid sector', () => {
    expect(sectorSchema.parse(validSector)).toEqual(validSector);
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      sectorSchema.parse({ ...validSector, priceFromCents: -1 }),
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => sectorSchema.parse({ ...validSector, name: '' })).toThrow();
  });

  it('accepts a null seatsAvailable for sectors without a seat map', () => {
    expect(
      sectorSchema.parse({ ...validSector, seatsAvailable: null })
        .seatsAvailable,
    ).toBeNull();
  });

  it('rejects a negative seatsAvailable', () => {
    expect(() =>
      sectorSchema.parse({ ...validSector, seatsAvailable: -1 }),
    ).toThrow();
  });
});

describe('eventDetailSchema', () => {
  it('accepts an event with sectors', () => {
    const detail = { ...validEvent, sectors: [validSector], artists: [] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('accepts an event with no sectors', () => {
    const detail = { ...validEvent, sectors: [], artists: [] };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('accepts an event with artists', () => {
    const detail = {
      ...validEvent,
      sectors: [],
      artists: [{ slug: 'banda-exemplo', name: 'Banda Exemplo' }],
    };
    expect(eventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a sector that violates the sector contract', () => {
    expect(() =>
      eventDetailSchema.parse({
        ...validEvent,
        sectors: [{ slug: 'plateia', name: 'Plateia' }],
        artists: [],
      }),
    ).toThrow();
  });
});

describe('eventDetailResponseSchema', () => {
  it('accepts a wrapped event detail payload', () => {
    const payload = {
      event: { ...validEvent, sectors: [validSector], artists: [] },
    };
    expect(eventDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('suggestQuerySchema', () => {
  it('trims and accepts a query with at least two characters', () => {
    expect(suggestQuerySchema.parse({ q: '  fanta ' })).toEqual({ q: 'fanta' });
  });

  it('rejects queries shorter than two characters', () => {
    expect(() => suggestQuerySchema.parse({ q: 'a' })).toThrow();
    expect(() => suggestQuerySchema.parse({ q: ' ' })).toThrow();
  });

  it('rejects a missing query', () => {
    expect(() => suggestQuerySchema.parse({})).toThrow();
  });
});

const validSuggestResponse = {
  events: [
    {
      slug: 'o-fantasma-da-opera',
      title: 'O Fantasma da Ópera',
      startsAt: '2026-10-22T23:00:00.000Z',
      venueName: 'Teatro Renault',
      venueCity: 'São Paulo',
      venueState: 'SP',
      priceFromCents: 12000,
    },
  ],
  locations: [{ city: 'São Paulo', state: 'SP' }],
};

describe('suggestResponseSchema', () => {
  it('accepts a valid payload', () => {
    expect(suggestResponseSchema.parse(validSuggestResponse)).toEqual(
      validSuggestResponse,
    );
  });

  it('accepts empty results', () => {
    expect(suggestResponseSchema.parse({ events: [], locations: [] })).toEqual({
      events: [],
      locations: [],
    });
  });

  it('rejects a location with a state shorter than two letters', () => {
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        locations: [{ city: 'São Paulo', state: 'S' }],
      }),
    ).toThrow();
  });

  it('rejects an event item without priceFromCents', () => {
    const { priceFromCents: _omitted, ...incomplete } =
      validSuggestResponse.events[0];
    expect(() =>
      suggestResponseSchema.parse({
        ...validSuggestResponse,
        events: [incomplete],
      }),
    ).toThrow();
  });
});

describe('artistDetailSchema', () => {
  const validArtist = {
    slug: 'andrew-lloyd-webber',
    name: 'Andrew Lloyd Webber',
    events: [
      {
        id: '3d8f2f3a-8c1b-4a2e-9c3d-1b2a3c4d5e6f',
        slug: 'o-fantasma-da-opera',
        title: 'O Fantasma da Ópera',
        description: 'Um musical famoso.',
        category: { slug: 'shows', name: 'Shows' },
        venue: {
          slug: 'teatro-renault',
          name: 'Teatro Renault',
          city: 'São Paulo',
          state: 'SP',
        },
        startsAt: '2026-10-22T23:00:00.000Z',
        priceFromCents: 12000,
        imageUrl: null,
        badgeLabel: null,
      },
    ],
  };

  it('accepts an artist with events', () => {
    expect(artistDetailSchema.parse(validArtist)).toEqual(validArtist);
  });

  it('accepts an artist with zero events', () => {
    expect(
      artistDetailSchema.parse({ ...validArtist, events: [] }).events,
    ).toEqual([]);
  });

  it('rejects an artist without slug', () => {
    const { slug: _slug, ...withoutSlug } = validArtist;
    expect(artistDetailSchema.safeParse(withoutSlug).success).toBe(false);
  });

  it('rejects an artist with empty name', () => {
    expect(
      artistDetailSchema.safeParse({ ...validArtist, name: '' }).success,
    ).toBe(false);
  });
});

describe('artistDetailResponseSchema', () => {
  it('wraps the artist', () => {
    const payload = {
      artist: {
        slug: 'comediantes-afiados',
        name: 'Comediantes Afiados',
        events: [],
      },
    };
    expect(artistDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('venueDetailSchema', () => {
  const validVenue = {
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
    events: [],
  };

  it('accepts a venue with city and state', () => {
    expect(venueDetailSchema.parse(validVenue)).toEqual(validVenue);
  });

  it('rejects a venue with invalid state', () => {
    expect(
      venueDetailSchema.safeParse({ ...validVenue, state: 'São Paulo' })
        .success,
    ).toBe(false);
  });
});

describe('venueDetailResponseSchema', () => {
  it('wraps the venue', () => {
    const payload = {
      venue: {
        slug: 'vivo-rio',
        name: 'Vivo Rio',
        city: 'Rio de Janeiro',
        state: 'RJ',
        events: [],
      },
    };
    expect(venueDetailResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('seatmapResponseSchema', () => {
  it('accepts a seatmap with rows and seat statuses', () => {
    const payload = {
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [
          {
            slug: 'plateia',
            name: 'Plateia',
            priceFromCents: 12000,
            rows: [
              {
                label: 'A',
                seats: [
                  { label: '1', status: 'available' },
                  { label: '2', status: 'occupied' },
                ],
              },
            ],
          },
        ],
      },
      holds: [],
    };
    expect(seatmapResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a seatmap with sectors without rows', () => {
    const payload = {
      seatmap: {
        eventSlug: 'corrida-de-rua-sp',
        sectors: [
          { slug: 'pista', name: 'Pista', priceFromCents: 15000, rows: [] },
        ],
      },
      holds: [],
    };
    expect(seatmapResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an unknown seat status', () => {
    const payload = {
      seatmap: {
        eventSlug: 'gig',
        sectors: [
          {
            slug: 'a',
            name: 'A',
            priceFromCents: 100,
            rows: [{ label: 'A', seats: [{ label: '1', status: 'reserved' }] }],
          },
        ],
      },
      holds: [],
    };
    expect(() => seatmapResponseSchema.parse(payload)).toThrow();
  });
});

describe('bestSeatQuerySchema', () => {
  it('trims the sector slug', () => {
    expect(bestSeatQuerySchema.parse({ sector: ' plateia ' }).sector).toBe(
      'plateia',
    );
  });

  it('rejects an empty sector', () => {
    expect(() => bestSeatQuerySchema.parse({ sector: '   ' })).toThrow();
  });
});

describe('bestSeatResponseSchema', () => {
  it('accepts a best seat payload', () => {
    const payload = {
      seat: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        priceFromCents: 12000,
      },
    };
    expect(bestSeatResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a negative price', () => {
    expect(() =>
      bestSeatResponseSchema.parse({
        seat: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          priceFromCents: -1,
        },
      }),
    ).toThrow();
  });
});

describe('seat hold contracts', () => {
  it('exposes hold ttl constants', () => {
    expect(SEAT_HOLD_TTL_SECONDS).toBe(600);
    expect(SEAT_HOLD_RENEW_AFTER_SECONDS).toBe(120);
    expect(SEAT_HOLD_RENEW_AFTER_SECONDS).toBeLessThan(SEAT_HOLD_TTL_SECONDS);
  });

  it('parses a hold request', () => {
    const parsed = holdRequestSchema.safeParse({
      sectorSlug: ' plateia ',
      rowLabel: 'A',
      seatLabel: '6',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sectorSlug).toBe('plateia');
    }
  });

  it('rejects a hold request with empty coords', () => {
    const parsed = holdRequestSchema.safeParse({
      sectorSlug: '',
      rowLabel: 'A',
      seatLabel: '6',
    });
    expect(parsed.success).toBe(false);
  });

  it('parses a hold response', () => {
    const parsed = holdResponseSchema.safeParse({
      hold: {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        expiresAt: '2026-10-16T12:00:00.000Z',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a release response', () => {
    expect(releaseResponseSchema.safeParse({ released: true }).success).toBe(
      true,
    );
    expect(releaseResponseSchema.safeParse({ released: false }).success).toBe(
      false,
    );
  });

  it('requires holds in the seatmap response', () => {
    const parsed = seatmapResponseSchema.safeParse({
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [],
      },
    });
    expect(parsed.success).toBe(false);

    const withHolds = seatmapResponseSchema.safeParse({
      seatmap: {
        eventSlug: 'o-fantasma-da-opera',
        sectors: [],
      },
      holds: [],
    });
    expect(withHolds.success).toBe(true);
  });
});

describe('ticket pricing', () => {
  it('prices inteira at the full sector price', () => {
    expect(ticketPriceCents('inteira', 12000)).toBe(12000);
  });

  it('prices meia at half price rounding to the nearest cent', () => {
    expect(ticketPriceCents('meia', 12000)).toBe(6000);
    expect(ticketPriceCents('meia', 12001)).toBe(6001);
  });

  it('prices vip at double the sector price', () => {
    expect(ticketPriceCents('vip', 12000)).toBe(24000);
  });
});

describe('cart contracts', () => {
  const validItem = {
    sectorSlug: 'plateia',
    rowLabel: 'A',
    seatLabel: '6',
    ticketType: 'meia',
    priceCents: 6000,
    expiresAt: '2026-10-16T12:10:00.000Z',
  };

  it('exposes the cart item limit', () => {
    expect(CART_MAX_ITEMS).toBe(8);
  });

  it('parses a cart payload', () => {
    expect(
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [validItem],
        expiresAt: '2026-10-16T12:10:00.000Z',
        totalCents: 6000,
      }),
    ).toEqual({
      eventSlug: 'o-fantasma-da-opera',
      items: [validItem],
      expiresAt: '2026-10-16T12:10:00.000Z',
      totalCents: 6000,
    });
  });

  it('accepts a cart without a deadline', () => {
    expect(
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [],
        expiresAt: null,
        totalCents: 0,
      }).expiresAt,
    ).toBeNull();
  });

  it('rejects an unknown ticket type in the cart', () => {
    expect(() =>
      cartSchema.parse({
        eventSlug: 'o-fantasma-da-opera',
        items: [{ ...validItem, ticketType: 'pista' }],
        expiresAt: null,
        totalCents: 0,
      }),
    ).toThrow();
  });

  it('parses a cart item request', () => {
    expect(
      cartItemRequestSchema.parse({
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'vip',
      }),
    ).toEqual({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'vip',
    });
  });

  it('rejects a cart item request with empty coords', () => {
    expect(() =>
      cartItemRequestSchema.parse({
        sectorSlug: '',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
      }),
    ).toThrow();
  });

  it('parses a set cart item response', () => {
    expect(
      setCartItemResponseSchema.parse({
        item: {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
        },
      }).item.ticketType,
    ).toBe('meia');
  });
});

describe('service fee', () => {
  it('charges 10% of the subtotal, rounded', () => {
    expect(SERVICE_FEE_BPS).toBe(1000);
    expect(serviceFeeCents(0)).toBe(0);
    expect(serviceFeeCents(12000)).toBe(1200);
    expect(serviceFeeCents(12345)).toBe(1235);
  });

  it('computes subtotal, fee and total', () => {
    expect(orderTotals([])).toEqual({
      subtotalCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
    });
    expect(orderTotals([{ priceCents: 12000 }, { priceCents: 6000 }])).toEqual({
      subtotalCents: 18000,
      serviceFeeCents: 1800,
      totalCents: 19800,
    });
  });
});

describe('order contracts', () => {
  it('parses a full order', () => {
    const order = orderSchema.parse({
      id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
      eventSlug: 'o-fantasma-da-opera',
      status: 'pending',
      paymentMethod: 'boleto',
      subtotalCents: 12000,
      serviceFeeCents: 1200,
      totalCents: 13200,
      refundCents: null,
      items: [
        {
          sectorSlug: 'plateia',
          sectorName: 'Plateia',
          rowLabel: 'A',
          seatLabel: '6',
          ticketType: 'meia',
          priceCents: 6000,
          ticket: null,
        },
      ],
      createdAt: new Date().toISOString(),
      paidAt: null,
    });
    expect(order.items[0].ticketType).toBe('meia');
  });

  it('rejects an unknown payment method and status', () => {
    expect(
      createOrderRequestSchema.safeParse({ paymentMethod: 'pix' }).success,
    ).toBe(false);
    expect(orderStatusSchema.safeParse('canceled').success).toBe(false);
  });

  it('parses the create-order response with the stripe payment block', () => {
    const response = createOrderResponseSchema.parse({
      order: {
        id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
        eventSlug: 'o-fantasma-da-opera',
        status: 'pending',
        paymentMethod: 'card',
        subtotalCents: 12000,
        serviceFeeCents: 1200,
        totalCents: 13200,
        refundCents: null,
        items: [],
        createdAt: new Date().toISOString(),
        paidAt: null,
      },
      payment: {
        provider: 'stripe',
        providerRef: 'pi_123',
        clientSecret: 'pi_123_secret',
      },
    });
    expect(response.payment.clientSecret).toBe('pi_123_secret');
    expect(
      orderPaymentSchema.safeParse({
        provider: 'pagarme',
        providerRef: 'x',
        clientSecret: null,
      }).success,
    ).toBe(false);
  });
});

describe('orderItemSchema', () => {
  it('accepts an item with a ticket and a null ticket', () => {
    expect(
      orderItemSchema.parse({
        sectorSlug: 'plateia',
        sectorName: 'Plateia',
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
        priceCents: 12000,
        ticket: { code: 'abc123', status: 'valid' },
      }).ticket?.status,
    ).toBe('valid');
    expect(
      orderItemSchema.parse({
        sectorSlug: 'plateia',
        sectorName: null,
        rowLabel: 'A',
        seatLabel: '6',
        ticketType: 'inteira',
        priceCents: 12000,
        ticket: null,
      }).ticket,
    ).toBeNull();
  });
});

describe('orderListResponseSchema', () => {
  it('parses the order history', () => {
    expect(
      orderListResponseSchema.parse({
        orders: [
          {
            id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
            eventSlug: 'o-fantasma-da-opera',
            eventTitle: 'O Fantasma da Ópera',
            eventStartsAt: '2026-10-22T20:00:00.000Z',
            status: 'paid',
            subtotalCents: 12000,
            serviceFeeCents: 1200,
            totalCents: 13200,
            itemCount: 1,
            createdAt: '2026-10-18T12:00:00.000Z',
          },
        ],
      }).orders[0]?.itemCount,
    ).toBe(1);
  });
});

describe('orderDetailResponseSchema', () => {
  const validOrder = {
    id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
    eventSlug: 'o-fantasma-da-opera',
    status: 'paid',
    paymentMethod: 'card',
    subtotalCents: 12000,
    serviceFeeCents: 1200,
    totalCents: 13200,
    refundCents: null,
    items: [],
    createdAt: '2026-10-18T12:00:00.000Z',
    paidAt: '2026-10-18T12:05:00.000Z',
  };

  it('accepts an event summary next to the order', () => {
    const payload = {
      order: validOrder,
      event: {
        slug: 'o-fantasma-da-opera',
        title: 'O Fantasma da Ópera',
        startsAt: '2026-11-20T23:00:00.000Z',
      },
    };
    expect(orderDetailResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts a null event for an order whose event is gone', () => {
    expect(
      orderDetailResponseSchema.parse({ order: validOrder, event: null }).event,
    ).toBeNull();
  });

  it('rejects an event summary without startsAt', () => {
    expect(
      orderDetailResponseSchema.safeParse({
        order: validOrder,
        event: { slug: 'o-fantasma-da-opera', title: 'O Fantasma da Ópera' },
      }).success,
    ).toBe(false);
  });
});

describe('formatBRL', () => {
  it('formats cents as brazilian reais', () => {
    expect(formatBRL(19800)).toBe('R$ 198,00');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatDatePtBR', () => {
  it('formats an iso date in portuguese', () => {
    expect(formatDatePtBR('2026-07-12T23:00:00.000Z')).toBe(
      '12 de Julho, 2026',
    );
  });
});

describe('TICKET_TYPE_LABELS', () => {
  it('labels every ticket type', () => {
    expect(TICKET_TYPE_LABELS).toEqual({
      inteira: 'Inteira',
      meia: 'Meia',
      vip: 'VIP',
    });
  });
});

describe('seatAvailabilityMessageSchema', () => {
  it('accepts a connected message', () => {
    expect(
      seatAvailabilityMessageSchema.safeParse({
        type: 'connected',
        eventSlug: 'o-fantasma-da-opera',
      }).success,
    ).toBe(true);
  });

  it('accepts a seat_status_changed message', () => {
    const parsed = seatAvailabilityMessageSchema.safeParse({
      type: 'seat_status_changed',
      eventSlug: 'o-fantasma-da-opera',
      changes: [
        {
          sectorSlug: 'plateia',
          rowLabel: 'Fila A',
          seatLabel: 'Cadeira 1',
          status: 'occupied',
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data).toMatchObject({ type: 'seat_status_changed' });
  });

  it('rejects unknown types and empty change lists', () => {
    expect(
      seatAvailabilityMessageSchema.safeParse({
        type: 'seat_added',
        eventSlug: 'x',
      }).success,
    ).toBe(false);
    expect(
      seatAvailabilityMessageSchema.safeParse({
        type: 'seat_status_changed',
        eventSlug: 'x',
        changes: [],
      }).success,
    ).toBe(false);
  });
});

describe('organizerEventCreateSchema', () => {
  const valid = {
    title: '  Rock Night  ',
    description: 'A night of rock music.',
    categorySlug: 'shows',
    venueSlug: 'audio-club',
    startsAt: '2026-11-10T20:00:00.000Z',
  };

  it('accepts and trims a valid event payload', () => {
    expect(organizerEventCreateSchema.parse(valid)).toEqual({
      title: 'Rock Night',
      description: 'A night of rock music.',
      categorySlug: 'shows',
      venueSlug: 'audio-club',
      startsAt: '2026-11-10T20:00:00.000Z',
    });
  });

  it('rejects a title shorter than three characters', () => {
    expect(() =>
      organizerEventCreateSchema.parse({ ...valid, title: 'ab' }),
    ).toThrow();
  });

  it('rejects a description shorter than ten characters', () => {
    expect(() =>
      organizerEventCreateSchema.parse({ ...valid, description: 'too short' }),
    ).toThrow();
  });

  it('rejects a startsAt that is not an iso datetime', () => {
    expect(() =>
      organizerEventCreateSchema.parse({ ...valid, startsAt: '10/11/2026' }),
    ).toThrow();
  });
});

describe('organizerVenueCreateSchema', () => {
  const valid = {
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'sp',
  };

  it('uppercases the state', () => {
    expect(organizerVenueCreateSchema.parse(valid).state).toBe('SP');
  });

  it('rejects a state that is not exactly two letters', () => {
    expect(() =>
      organizerVenueCreateSchema.parse({ ...valid, state: 'SPX' }),
    ).toThrow();
  });

  it('rejects a name shorter than three characters', () => {
    expect(() =>
      organizerVenueCreateSchema.parse({ ...valid, name: 'ab' }),
    ).toThrow();
  });
});

describe('organizerRowCreateSchema', () => {
  const valid = { label: 'A', seatCount: 20 };

  it('accepts and trims a valid row', () => {
    expect(
      organizerRowCreateSchema.parse({ label: '  A  ', seatCount: 20 }),
    ).toEqual({
      label: 'A',
      seatCount: 20,
    });
  });

  it('rejects a seatCount of zero', () => {
    expect(() =>
      organizerRowCreateSchema.parse({ ...valid, seatCount: 0 }),
    ).toThrow();
  });

  it('rejects a seatCount above two hundred', () => {
    expect(() =>
      organizerRowCreateSchema.parse({ ...valid, seatCount: 201 }),
    ).toThrow();
  });
});

describe('organizerSectorCreateSchema', () => {
  const valid = {
    name: 'Plateia',
    priceFromCents: 12000,
    rows: [
      { label: 'A', seatCount: 3 },
      { label: 'B', seatCount: 1 },
    ],
  };

  it('accepts a valid sector with rows', () => {
    expect(organizerSectorCreateSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an empty rows list', () => {
    expect(() =>
      organizerSectorCreateSchema.parse({ ...valid, rows: [] }),
    ).toThrow();
  });

  it('rejects a row list with more than sixty rows', () => {
    expect(() =>
      organizerSectorCreateSchema.parse({
        ...valid,
        rows: Array.from({ length: 61 }, () => ({ label: 'A', seatCount: 1 })),
      }),
    ).toThrow();
  });

  it('rejects a negative priceFromCents', () => {
    expect(() =>
      organizerSectorCreateSchema.parse({ ...valid, priceFromCents: -1 }),
    ).toThrow();
  });
});

describe('organizerLotCreateSchema', () => {
  const valid = {
    name: 'Primeiro lote',
    priceCents: 10000,
    startsAt: '2026-11-01T10:00:00.000Z',
    endsAt: '2026-11-15T10:00:00.000Z',
  };

  it('accepts a valid lot', () => {
    expect(organizerLotCreateSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a non-iso startsAt', () => {
    expect(() =>
      organizerLotCreateSchema.parse({ ...valid, startsAt: '01/11/2026' }),
    ).toThrow();
  });

  it('rejects a non-iso endsAt', () => {
    expect(() =>
      organizerLotCreateSchema.parse({ ...valid, endsAt: '15/11/2026' }),
    ).toThrow();
  });

  it('rejects a negative priceCents', () => {
    expect(() =>
      organizerLotCreateSchema.parse({ ...valid, priceCents: -1 }),
    ).toThrow();
  });
});

const validOrganizerEventDto = {
  id: '7f9c1a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  slug: 'rock-night-sao-paulo',
  title: 'Rock Night',
  description: 'A night of rock music.',
  category: { slug: 'music', name: 'Music' },
  venue: {
    slug: 'audio-club',
    name: 'Audio Club',
    city: 'São Paulo',
    state: 'SP',
  },
  startsAt: '2026-11-10T20:00:00.000Z',
  priceFromCents: 8000,
  platform: false,
};

describe('organizerEventDtoSchema', () => {
  it('accepts an organizer event', () => {
    expect(organizerEventDtoSchema.parse(validOrganizerEventDto)).toEqual(
      validOrganizerEventDto,
    );
  });

  it('accepts a platform event', () => {
    expect(
      organizerEventDtoSchema.parse({
        ...validOrganizerEventDto,
        platform: true,
      }).platform,
    ).toBe(true);
  });

  it('rejects an event without the platform flag', () => {
    const { platform: _omitted, ...withoutPlatform } = validOrganizerEventDto;
    expect(() => organizerEventDtoSchema.parse(withoutPlatform)).toThrow();
  });
});

describe('organizerSeatRowDtoSchema', () => {
  const valid = {
    id: 'f1a5f6b2-9c3d-4c4a-9a1b-2c3d4e5f6a7b',
    label: 'A',
    seatCount: 20,
  };

  it('accepts a valid row dto', () => {
    expect(organizerSeatRowDtoSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a row dto with negative seatCount', () => {
    expect(() =>
      organizerSeatRowDtoSchema.parse({ ...valid, seatCount: -1 }),
    ).toThrow();
  });
});

describe('organizerLotDtoSchema', () => {
  const valid = {
    id: 'a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
    name: 'Primeiro lote',
    priceCents: 10000,
    startsAt: '2026-11-01T10:00:00.000Z',
    endsAt: '2026-11-15T10:00:00.000Z',
  };

  it('accepts a valid lot dto', () => {
    expect(organizerLotDtoSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a lot dto without an id', () => {
    const { id: _omitted, ...withoutId } = valid;
    expect(() => organizerLotDtoSchema.parse(withoutId)).toThrow();
  });
});

describe('organizerSectorDtoSchema', () => {
  const valid = {
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
    slug: 'plateia',
    name: 'Plateia',
    priceFromCents: 12000,
    seatsTotal: 4,
    rows: [
      { id: 'f1a5f6b2-9c3d-4c4a-9a1b-2c3d4e5f6a7b', label: 'A', seatCount: 3 },
    ],
    lots: [
      {
        id: 'a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
        name: 'Primeiro lote',
        priceCents: 10000,
        startsAt: '2026-11-01T10:00:00.000Z',
        endsAt: '2026-11-15T10:00:00.000Z',
      },
    ],
  };

  it('accepts a sector with rows and lots', () => {
    expect(organizerSectorDtoSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a sector without rows and lots', () => {
    expect(
      organizerSectorDtoSchema.parse({ ...valid, rows: [], lots: [] }).rows,
    ).toEqual([]);
  });

  it('rejects a sector with an invalid row', () => {
    expect(() =>
      organizerSectorDtoSchema.parse({
        ...valid,
        rows: [{ label: 'A' }],
      }),
    ).toThrow();
  });
});

describe('organizerEventDetailSchema', () => {
  it('extends the dto with sectors', () => {
    const detail = {
      ...validOrganizerEventDto,
      sectors: [],
    };
    expect(organizerEventDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects a sector that violates the organizer sector contract', () => {
    expect(() =>
      organizerEventDetailSchema.parse({
        ...validOrganizerEventDto,
        sectors: [{ slug: 'plateia', name: 'Plateia' }],
      }),
    ).toThrow();
  });
});

describe('organizer response schemas', () => {
  const validOrganizerVenueDto = {
    id: 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a',
    slug: 'teatro-renault',
    name: 'Teatro Renault',
    city: 'São Paulo',
    state: 'SP',
  };

  it('parses the organizer event list response', () => {
    expect(
      organizerEventListResponseSchema.parse({
        events: [validOrganizerEventDto],
      }),
    ).toEqual({ events: [validOrganizerEventDto] });
    expect(
      organizerEventListResponseSchema.safeParse({ events: [{}] }).success,
    ).toBe(false);
  });

  it('parses the organizer venue list response', () => {
    expect(
      organizerVenueListResponseSchema.parse({
        venues: [validOrganizerVenueDto],
      }),
    ).toEqual({ venues: [validOrganizerVenueDto] });
    expect(
      organizerVenueListResponseSchema.safeParse({ venues: [{}] }).success,
    ).toBe(false);
  });

  it('parses the single event and detail responses', () => {
    expect(
      organizerEventResponseSchema.parse({ event: validOrganizerEventDto }),
    ).toEqual({ event: validOrganizerEventDto });
    expect(
      organizerEventResponseSchema.safeParse({ event: { slug: 'x' } }).success,
    ).toBe(false);

    const detailPayload = {
      event: { ...validOrganizerEventDto, sectors: [] },
    };
    expect(organizerEventDetailResponseSchema.parse(detailPayload)).toEqual(
      detailPayload,
    );
    expect(
      organizerEventDetailResponseSchema.safeParse({
        event: validOrganizerEventDto,
      }).success,
    ).toBe(false);
  });

  it('parses the single venue response', () => {
    expect(
      organizerVenueResponseSchema.parse({ venue: validOrganizerVenueDto }),
    ).toEqual({ venue: validOrganizerVenueDto });
    expect(
      organizerVenueResponseSchema.safeParse({ venue: { slug: 'x' } }).success,
    ).toBe(false);
  });
});

describe('organizerSalesReportSchema', () => {
  const validReport = {
    eventId: '2f1a3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-31T23:59:59.999Z',
    ticketsSold: 120,
    ordersCount: 45,
    grossCents: 90000,
    platformFeeCents: 4500,
    netCents: 85500,
  };

  it('parses a valid report with from/to present', () => {
    expect(organizerSalesReportSchema.parse(validReport)).toEqual(validReport);
  });

  it('allows from and to to be null', () => {
    const report = {
      ...validReport,
      from: null,
      to: null,
    };
    expect(organizerSalesReportSchema.parse(report)).toEqual(report);
  });

  it('rejects a netCents inconsistent with gross minus fee', () => {
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        netCents: 85000,
      }).success,
    ).toBe(false);
  });

  it('rejects from >= to when both are present', () => {
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        to: '2026-10-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        to: '2026-10-01T00:00:00.000Z',
        from: '2026-10-31T23:59:59.999Z',
      }).success,
    ).toBe(false);
  });

  it('rejects negative counts and cents', () => {
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        ticketsSold: -1,
      }).success,
    ).toBe(false);
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        ordersCount: -1,
      }).success,
    ).toBe(false);
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        grossCents: -1,
      }).success,
    ).toBe(false);
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        platformFeeCents: -1,
      }).success,
    ).toBe(false);
    expect(
      organizerSalesReportSchema.safeParse({
        ...validReport,
        netCents: -1,
      }).success,
    ).toBe(false);
  });
});

describe('organizerSalesReportResponseSchema', () => {
  const validReport = {
    eventId: '2f1a3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    from: null,
    to: null,
    ticketsSold: 0,
    ordersCount: 0,
    grossCents: 0,
    platformFeeCents: 0,
    netCents: 0,
  };

  it('parses the report response', () => {
    const payload = { report: validReport };
    expect(organizerSalesReportResponseSchema.parse(payload)).toEqual(payload);
    expect(
      organizerSalesReportResponseSchema.safeParse({ report: {} }).success,
    ).toBe(false);
  });
});

describe('organizerSalesReportQuerySchema', () => {
  it('accepts absent from and to', () => {
    expect(organizerSalesReportQuerySchema.parse({})).toEqual({});
  });

  it('accepts valid datetimes', () => {
    expect(
      organizerSalesReportQuerySchema.parse({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
      }),
    ).toEqual({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-31T23:59:59.999Z',
    });
  });

  it('rejects an invalid datetime string', () => {
    expect(
      organizerSalesReportQuerySchema.safeParse({ from: 'not-a-date' }).success,
    ).toBe(false);
    expect(
      organizerSalesReportQuerySchema.safeParse({ to: '2026-13-01' }).success,
    ).toBe(false);
  });
});

describe('organizerTicketValidationRecordSchema', () => {
  const usedAt = '2026-10-26T20:00:00.000Z';

  it('parses a valid result with seat fields filled', () => {
    const payload = {
      result: 'valid',
      usedAt: null,
      usedBy: null,
      sectorName: 'Pista Premium',
      rowLabel: 'A',
      seatLabel: '12',
    };
    expect(organizerTicketValidationRecordSchema.parse(payload)).toEqual(
      payload,
    );
  });

  it('parses an already_used result with usage metadata', () => {
    const payload = {
      result: 'already_used',
      usedAt,
      usedBy: 'operator-1',
      sectorName: null,
      rowLabel: null,
      seatLabel: null,
    };
    expect(organizerTicketValidationRecordSchema.parse(payload)).toEqual(
      payload,
    );
  });

  it('parses an invalid result with all fields null', () => {
    const payload = {
      result: 'invalid',
      usedAt: null,
      usedBy: null,
      sectorName: null,
      rowLabel: null,
      seatLabel: null,
    };
    expect(organizerTicketValidationRecordSchema.parse(payload)).toEqual(
      payload,
    );
  });

  it('rejects already_used without usedAt or usedBy', () => {
    const base = {
      result: 'already_used',
      usedAt,
      usedBy: 'operator-1',
      sectorName: null,
      rowLabel: null,
      seatLabel: null,
    };
    expect(
      organizerTicketValidationRecordSchema.safeParse({
        ...base,
        usedAt: null,
      }).success,
    ).toBe(false);
    expect(
      organizerTicketValidationRecordSchema.safeParse({
        ...base,
        usedBy: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a valid result with usage metadata', () => {
    expect(
      organizerTicketValidationRecordSchema.safeParse({
        result: 'valid',
        usedAt,
        usedBy: null,
        sectorName: 'Pista Premium',
        rowLabel: 'A',
        seatLabel: '12',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid result carrying usage or seat data', () => {
    expect(
      organizerTicketValidationRecordSchema.safeParse({
        result: 'invalid',
        usedAt,
        usedBy: null,
        sectorName: null,
        rowLabel: null,
        seatLabel: null,
      }).success,
    ).toBe(false);
    expect(
      organizerTicketValidationRecordSchema.safeParse({
        result: 'invalid',
        usedAt: null,
        usedBy: null,
        sectorName: 'Pista Premium',
        rowLabel: 'A',
        seatLabel: '12',
      }).success,
    ).toBe(false);
  });
});

describe('organizerTicketValidationResponseSchema', () => {
  const validRecord = {
    result: 'valid',
    usedAt: null,
    usedBy: null,
    sectorName: 'Pista Premium',
    rowLabel: 'A',
    seatLabel: '12',
  };

  it('parses the wrapped validation record', () => {
    const payload = { validation: validRecord };
    expect(organizerTicketValidationResponseSchema.parse(payload)).toEqual(
      payload,
    );
  });

  it('rejects a payload wrapping an invalid record', () => {
    expect(
      organizerTicketValidationResponseSchema.safeParse({
        validation: { ...validRecord, result: 'unknown' },
      }).success,
    ).toBe(false);
    expect(
      organizerTicketValidationResponseSchema.safeParse({ validation: {} })
        .success,
    ).toBe(false);
  });
});

describe('organizerTicketValidateSchema', () => {
  it('accepts a non-empty code', () => {
    expect(organizerTicketValidateSchema.parse({ code: 'TKV-123' })).toEqual({
      code: 'TKV-123',
    });
  });

  it('rejects an empty code', () => {
    expect(organizerTicketValidateSchema.safeParse({ code: '' }).success).toBe(
      false,
    );
  });

  it('rejects a missing code', () => {
    expect(organizerTicketValidateSchema.safeParse({}).success).toBe(false);
  });
});

describe('orderStatusSchema', () => {
  it('accepts the refunded status', () => {
    expect(orderStatusSchema.safeParse('refunded').success).toBe(true);
  });
});

describe('orderSchema', () => {
  it('accepts a nullable refundCents', () => {
    const parsed = orderSchema.shape.refundCents.safeParse(null);
    expect(parsed.success).toBe(true);
  });
});

describe('organizer event policy fields', () => {
  it('accepts cancellationWindowHours and refundPercent', () => {
    expect(
      organizerEventDtoSchema.shape.cancellationWindowHours.safeParse(24)
        .success,
    ).toBe(true);
    expect(
      organizerEventDtoSchema.shape.refundPercent.safeParse(70).success,
    ).toBe(true);
    expect(
      organizerEventDtoSchema.shape.refundPercent.safeParse(101).success,
    ).toBe(false);
  });

  it('keeps policy fields optional', () => {
    const parsed = organizerEventDtoSchema.safeParse(validOrganizerEventDto);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.cancellationWindowHours).toBe(
      undefined,
    );
    expect(parsed.success && parsed.data.refundPercent).toBe(undefined);
  });
});

describe('orderSplit', () => {
  it('derives the split from the stored gross total and service fee', () => {
    expect(orderSplit({ totalCents: 11000, serviceFeeCents: 1000 })).toEqual({
      grossCents: 11000,
      platformFeeCents: 1000,
      organizerNetCents: 10000,
    });
  });

  it('keeps platform fee plus organizer net equal to gross', () => {
    const split = orderSplit({ totalCents: 11000, serviceFeeCents: 1000 });
    expect(split.platformFeeCents + split.organizerNetCents).toBe(
      split.grossCents,
    );
  });

  it('uses the stored order fee instead of recomputing it from the gross', () => {
    const totals = orderTotals([{ priceCents: 10000 }]);
    const split = orderSplit({
      totalCents: totals.totalCents,
      serviceFeeCents: totals.serviceFeeCents,
    });
    expect(split).toEqual({
      grossCents: 11000,
      platformFeeCents: 1000,
      organizerNetCents: 10000,
    });
    expect(split.organizerNetCents).toBe(totals.subtotalCents);
  });
});

describe('transferStatusSchema', () => {
  it('accepts the five transfer statuses', () => {
    for (const status of [
      'none',
      'pending',
      'succeeded',
      'failed',
      'skipped',
    ] as const) {
      expect(transferStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(transferStatusSchema.safeParse('unknown').success).toBe(false);
  });
});

describe('organizer connect and transfer contracts', () => {
  const validEntry = {
    orderId: '2f1a3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    eventTitle: 'Rock Night',
    eventSlug: 'rock-night-sao-paulo',
    grossCents: 19999,
    platformFeeCents: 2000,
    organizerNetCents: 17999,
    transferStatus: 'succeeded',
    createdAt: '2026-10-29T12:00:00.000Z',
  };

  it('parses a connect status payload', () => {
    expect(
      organizerConnectStatusSchema.parse({
        connected: true,
        payoutsEnabled: true,
      }),
    ).toEqual({ connected: true, payoutsEnabled: true });
    expect(
      organizerConnectStatusSchema.safeParse({ connected: true }).success,
    ).toBe(false);
  });

  it('parses a connect response with and without an onboarding url', () => {
    expect(
      organizerConnectResponseSchema.parse({
        onboardingUrl: 'https://connect.stripe.com/setup/e/acct_123',
      }).onboardingUrl,
    ).toBe('https://connect.stripe.com/setup/e/acct_123');
    expect(
      organizerConnectResponseSchema.parse({ onboardingUrl: null })
        .onboardingUrl,
    ).toBeNull();
    expect(
      organizerConnectResponseSchema.safeParse({
        onboardingUrl: 'not-a-url',
      }).success,
    ).toBe(false);
  });

  it('parses a transfer entry', () => {
    expect(organizerTransferEntrySchema.parse(validEntry)).toEqual(validEntry);
    expect(
      organizerTransferEntrySchema.safeParse({ ...validEntry, grossCents: -1 })
        .success,
    ).toBe(false);
    expect(
      organizerTransferEntrySchema.safeParse({
        ...validEntry,
        createdAt: '29/10/2026',
      }).success,
    ).toBe(false);
  });

  it('parses the transfers list response', () => {
    const payload = { transfers: [validEntry] };
    expect(organizerTransfersResponseSchema.parse(payload)).toEqual(payload);
    expect(
      organizerTransfersResponseSchema.safeParse({ transfers: [{}] }).success,
    ).toBe(false);
  });
});
