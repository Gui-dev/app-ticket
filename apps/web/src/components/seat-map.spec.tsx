import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const server = setupServer();

let SeatMap: typeof import('./seat-map').SeatMap;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ SeatMap } = await import('./seat-map'));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const seatmapPayload = {
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
              { label: '3', status: 'unavailable' },
              { label: '4', status: 'available' },
              { label: '5', status: 'available' },
              { label: '6', status: 'available' },
              { label: '7', status: 'available' },
            ],
          },
          {
            label: 'B',
            seats: [
              { label: '1', status: 'available' },
              { label: '2', status: 'available' },
              { label: '3', status: 'available' },
            ],
          },
        ],
      },
      {
        slug: 'balcao',
        name: 'Balcão',
        priceFromCents: 19000,
        rows: [
          {
            label: 'A',
            seats: [
              { label: '1', status: 'available' },
              { label: '2', status: 'available' },
            ],
          },
        ],
      },
    ],
  },
  holds: [] as {
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    expiresAt: string;
  }[],
};

function mockSeatmap() {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
      HttpResponse.json(seatmapPayload),
    ),
  );
}

function mockCart(
  items: {
    sectorSlug: string;
    rowLabel: string;
    seatLabel: string;
    ticketType: string;
    priceCents: number;
  }[] = [],
) {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/cart$/, () =>
      HttpResponse.json({
        eventSlug: 'o-fantasma-da-opera',
        items: items.map((item) => ({
          ...item,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        })),
        expiresAt:
          items.length > 0
            ? new Date(Date.now() + 600_000).toISOString()
            : null,
        totalCents: 0,
      }),
    ),
  );
}

function mockHold(seatLabel = '6', status: number = 201) {
  server.use(
    http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () =>
      HttpResponse.json(
        {
          hold: {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel,
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
        { status },
      ),
    ),
  );
}

function mockRelease() {
  server.use(
    http.post(/\/api\/events\/o-fantasma-da-opera\/holds\/release$/, () =>
      HttpResponse.json({ released: true }),
    ),
  );
}

const CART_ITEM_6 = 'Plateia · Fila A · Cadeira 6 · R$ 120,00';

describe('SeatMap', () => {
  it('renders sectors, rows and seat states', async () => {
    mockSeatmap();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Cadeira 2, fila A' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cadeira 3, fila A' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Plateia' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));
    expect(screen.getByRole('button', { name: 'Balcão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Cadeira 3, fila A' }),
    ).not.toBeInTheDocument();
  });

  it('adds a free seat to the cart', async () => {
    mockSeatmap();
    mockHold('1');
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 120,00')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the cart when switching sectors', async () => {
    mockSeatmap();
    mockHold('1');
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );
    await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00');

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));

    expect(
      screen.getByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(releasedLabels).toEqual([]);
  });

  it('picks the best available seat in one click', async () => {
    mockSeatmap();
    mockHold('1');
    server.use(
      http.get(/\/api\/events\/.+\/best-seat$/, () =>
        HttpResponse.json({
          seat: {
            sectorSlug: 'plateia',
            rowLabel: 'A',
            seatLabel: '1',
            priceFromCents: 12000,
          },
        }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Melhor lugar disponível' }),
    );

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 120,00'),
    ).toBeInTheDocument();
  });

  it('warns when the sector has no free seats', async () => {
    mockSeatmap();
    server.use(
      http.get(/\/api\/events\/.+\/best-seat$/, () =>
        HttpResponse.json({ error: 'no_available_seat' }, { status: 404 }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Melhor lugar disponível' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não há assentos livres neste setor.',
    );
  });

  it('shows an error when the seatmap request fails', async () => {
    server.use(
      http.get(/\/api\/events\/.+\/seatmap$/, () => HttpResponse.error()),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o mapa de assentos.',
    );
  });

  it('shows an empty state for events without numbered sectors', async () => {
    server.use(
      http.get(/\/api\/events\/.+\/seatmap$/, () =>
        HttpResponse.json({
          seatmap: { eventSlug: 'corrida-de-rua-sp', sectors: [] },
          holds: [],
        }),
      ),
    );
    render(<SeatMap eventSlug="corrida-de-rua-sp" />);

    expect(
      await screen.findByText(
        'O mapa de assentos ainda não foi publicado para este evento.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the countdown and lets the buyer give up', async () => {
    mockSeatmap();
    mockHold();
    mockRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();
    expect(
      await screen.findByText(/Reserva expira em \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desistir de todos' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 120,00')).toBeInTheDocument();
  });

  it('restores holds and ticket types from the server', async () => {
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
        HttpResponse.json({
          ...seatmapPayload,
          holds: [
            {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '1',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          ],
        }),
      ),
    );
    mockCart([
      {
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '1',
        ticketType: 'meia',
        priceCents: 6000,
      },
    ]);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 1 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 60,00')).toBeInTheDocument();

    const seatOne = screen.getByRole('button', { name: 'Cadeira 1, fila A' });
    expect(seatOne).toBeEnabled();
    expect(seatOne).toHaveAttribute('aria-pressed', 'true');
  });

  it('renews automatically when the countdown is low', async () => {
    vi.useFakeTimers();
    try {
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
          HttpResponse.json({
            ...seatmapPayload,
            holds: [
              {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: '1',
                expiresAt: new Date(Date.now() + 100_000).toISOString(),
              },
            ],
          }),
        ),
      );
      mockCart();
      let renewCalls = 0;
      server.use(
        http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () => {
          renewCalls += 1;
          return HttpResponse.json(
            {
              hold: {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: '1',
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
            },
            { status: 200 },
          );
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(0);
        if (screen.queryByText(/Reserva expira em/)) break;
      }
      expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(1_500);
      expect(renewCalls).toBe(1);
      expect(screen.getByText('Reserva renovada')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases every seat when the buyer gives up', async () => {
    mockSeatmap();
    const heldLabels: string[] = [];
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          heldLabels.push(body.seatLabel);
          return HttpResponse.json({
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: body.seatLabel,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          });
        },
      ),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));
    await screen.findByText('Total: R$ 240,00');
    expect(heldLabels).toEqual(['6', '7']);

    fireEvent.click(screen.getByRole('button', { name: 'Desistir de todos' }));
    await vi.waitFor(() => expect(releasedLabels.sort()).toEqual(['6', '7']));
    expect(
      await screen.findByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reserva expira em/)).not.toBeInTheDocument();
  });

  it('releases a seat when clicking it again', async () => {
    mockSeatmap();
    mockHold('6');
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 6, fila A' }));

    await vi.waitFor(() => expect(releasedLabels).toEqual(['6']));
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum assento no carrinho.')).toBeInTheDocument();
  });

  it('adds a second seat without releasing the first', async () => {
    mockSeatmap();
    const heldLabels: string[] = [];
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          heldLabels.push(body.seatLabel);
          return HttpResponse.json({
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: body.seatLabel,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          });
        },
      ),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 7 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 240,00')).toBeInTheDocument();
    expect(heldLabels).toEqual(['6', '7']);
    expect(releasedLabels).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Cadeira 6, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Cadeira 7, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('updates the ticket type through the cart', async () => {
    mockSeatmap();
    mockHold('6');
    const putBodies: {
      sectorSlug: string;
      rowLabel: string;
      seatLabel: string;
      ticketType: string;
    }[] = [];
    server.use(
      http.put(
        /\/api\/events\/o-fantasma-da-opera\/cart\/items$/,
        async ({ request }) => {
          const body = (await request.json()) as (typeof putBodies)[number];
          putBodies.push(body);
          return HttpResponse.json({ item: body });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);

    fireEvent.change(
      screen.getByLabelText('Tipo de ingresso — Plateia, fila A, cadeira 6'),
      { target: { value: 'meia' } },
    );

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 60,00')).toBeInTheDocument();
    await vi.waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toMatchObject({
      sectorSlug: 'plateia',
      rowLabel: 'A',
      seatLabel: '6',
      ticketType: 'meia',
    });
  });

  it('shows the cart limit message when the server rejects the seat', async () => {
    mockSeatmap();
    server.use(
      http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () =>
        HttpResponse.json({ error: 'cart_limit' }, { status: 409 }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText('Você já reservou o número máximo de assentos.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
  });

  it('keeps the map rendered when a later poll fails', async () => {
    vi.useFakeTimers();
    try {
      let gets = 0;
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
          gets += 1;
          if (gets === 1) return HttpResponse.json(seatmapPayload);
          return HttpResponse.error();
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(0);
        if (screen.queryByText(/8 de 10 livres/)) break;
      }
      expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBeGreaterThan(1);
      expect(screen.getByText(/8 de 10 livres/)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reverts when the seat was just taken', async () => {
    mockSeatmap();
    mockHold('6', 409);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText(
        'Este assento acabou de ser reservado por outro comprador.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
  });

  it('signs in anonymously and retries when the hold gets a 401', async () => {
    mockSeatmap();
    let anonymousCalls = 0;
    let holdCalls = 0;
    server.use(
      http.post(/\/api\/auth\/sign-in\/anonymous$/, () => {
        anonymousCalls += 1;
        return HttpResponse.json({ token: 'anonymous-token' });
      }),
      http.post(/\/api\/events\/o-fantasma-da-opera\/holds$/, () => {
        holdCalls += 1;
        if (holdCalls === 1) {
          return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
        return HttpResponse.json(
          {
            hold: {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '6',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
          { status: 201 },
        );
      }),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();
    expect(anonymousCalls).toBe(1);
    expect(holdCalls).toBe(2);
  });

  it('dedupes concurrent anonymous sign-ins across seats', async () => {
    mockSeatmap();
    let anonymousCalls = 0;
    const attempts = new Map<string, number>();
    let releaseSignIn: () => void = () => {};
    const bothAttempted = new Promise<void>((resolve) => {
      releaseSignIn = resolve;
    });
    server.use(
      http.post(/\/api\/auth\/sign-in\/anonymous$/, async () => {
        anonymousCalls += 1;
        await bothAttempted;
        return HttpResponse.json({ token: 'anonymous-token' });
      }),
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          const count = attempts.get(body.seatLabel) ?? 0;
          attempts.set(body.seatLabel, count + 1);
          if (attempts.size >= 2) releaseSignIn();
          if (count === 0) {
            return HttpResponse.json(
              { error: 'unauthorized' },
              { status: 401 },
            );
          }
          return HttpResponse.json(
            {
              hold: {
                sectorSlug: 'plateia',
                rowLabel: 'A',
                seatLabel: body.seatLabel,
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
            },
            { status: 201 },
          );
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));

    expect(
      await screen.findByText('Plateia · Fila A · Cadeira 6 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Plateia · Fila A · Cadeira 7 · R$ 120,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 240,00')).toBeInTheDocument();
    await vi.waitFor(() => expect(anonymousCalls).toBe(1));
    expect(attempts.get('6')).toBe(2);
    expect(attempts.get('7')).toBe(2);
  });

  it('does not resurrect a seat after the buyer gives up', async () => {
    mockSeatmap();
    let gets = 0;
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
        gets += 1;
        return HttpResponse.json({
          ...seatmapPayload,
          holds: [
            {
              sectorSlug: 'plateia',
              rowLabel: 'A',
              seatLabel: '6',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          ],
        });
      }),
    );
    mockHold('6');
    mockRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desistir de todos' }));
    await vi.waitFor(() =>
      expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument(),
    );
    expect(gets).toBeGreaterThan(1);
    expect(screen.queryByText(CART_ITEM_6)).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum assento no carrinho.')).toBeInTheDocument();
  });

  it('polls the seatmap while mounted', async () => {
    vi.useFakeTimers();
    try {
      let gets = 0;
      server.use(
        http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
          gets += 1;
          return HttpResponse.json(seatmapPayload);
        }),
      );
      render(<SeatMap eventSlug="o-fantasma-da-opera" />);
      await vi.advanceTimersByTimeAsync(0);
      expect(gets).toBe(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(gets).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back the ticket type when the update fails', async () => {
    mockSeatmap();
    mockHold('6');
    mockCart();
    server.use(
      http.put(/\/api\/events\/o-fantasma-da-opera\/cart\/items$/, () =>
        HttpResponse.json({ error: 'server_error' }, { status: 500 }),
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);

    fireEvent.change(
      screen.getByLabelText('Tipo de ingresso — Plateia, fila A, cadeira 6'),
      { target: { value: 'meia' } },
    );

    expect(await screen.findByText(CART_ITEM_6)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar o tipo de ingresso.',
    );
    expect(screen.getByText('Total: R$ 120,00')).toBeInTheDocument();
  });

  it('removes a seat through the cart remove button', async () => {
    mockSeatmap();
    mockHold('6');
    const releasedLabels: string[] = [];
    server.use(
      http.post(
        /\/api\/events\/o-fantasma-da-opera\/holds\/release$/,
        async ({ request }) => {
          const body = (await request.json()) as { seatLabel: string };
          releasedLabels.push(body.seatLabel);
          return HttpResponse.json({ released: true });
        },
      ),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(CART_ITEM_6);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remover Plateia, fila A, cadeira 6',
      }),
    );

    await vi.waitFor(() => expect(releasedLabels).toEqual(['6']));
    expect(
      await screen.findByText('Nenhum assento no carrinho.'),
    ).toBeInTheDocument();
  });
});
