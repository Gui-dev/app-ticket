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
  orderStatusSchema,
  orderTotals,
  releaseResponseSchema,
  SEAT_HOLD_RENEW_AFTER_SECONDS,
  SEAT_HOLD_TTL_SECONDS,
  SERVICE_FEE_BPS,
  searchFiltersSchema,
  seatmapResponseSchema,
  sectorSchema,
  serviceFeeCents,
  setCartItemResponseSchema,
  suggestQuerySchema,
  suggestResponseSchema,
  TICKET_TYPE_LABELS,
  ticketPriceCents,
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
    expect(orderStatusSchema.safeParse('refunded').success).toBe(false);
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
