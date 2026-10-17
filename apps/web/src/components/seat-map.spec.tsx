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
  holds: [],
};

function useSeatmap() {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
      HttpResponse.json(seatmapPayload),
    ),
  );
}

function useHold(seatLabel = '6', status: number = 201) {
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

function useRelease() {
  server.use(
    http.post(/\/api\/events\/o-fantasma-da-opera\/holds\/release$/, () =>
      HttpResponse.json({ released: true }),
    ),
  );
}

describe('SeatMap', () => {
  it('renders sectors, rows and seat states', async () => {
    useSeatmap();
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

  it('selects a free seat and shows the summary', async () => {
    useSeatmap();
    useHold('1');
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Você selecionou: Plateia · Fila A · Cadeira 1 · R$ 120,00',
    );
    expect(
      screen.getByRole('button', { name: 'Cadeira 1, fila A' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clears the selection when switching sectors', async () => {
    useSeatmap();
    useHold('1');
    useRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 1, fila A' }),
    );
    expect(await screen.findByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Balcão' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('picks the best available seat in one click', async () => {
    useSeatmap();
    useHold('1');
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

    expect(await screen.findByRole('status')).toHaveTextContent('Cadeira 1');
  });

  it('warns when the sector has no free seats', async () => {
    useSeatmap();
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

  it('holds the seat on selection and shows the countdown', async () => {
    useSeatmap();
    useHold();
    useRelease();
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText(/Reserva expira em \d{2}:\d{2}/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desistir da reserva' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
      ),
    ).toBeInTheDocument();
  });

  it('restores the hold from the seatmap response', async () => {
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
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);

    expect(
      await screen.findByText(
        'Você selecionou: Plateia · Fila A · Cadeira 1 · R$ 120,00',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reserva expira em/)).toBeInTheDocument();

    // The owner's own hold maps back to occupied; the seat must stay
    // clickable and pressed so the buyer can still release it.
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

  it('releases the hold when the buyer gives up', async () => {
    useSeatmap();
    useHold();
    let released = false;
    server.use(
      http.post(/\/api\/events\/o-fantasma-da-opera\/holds\/release$/, () => {
        released = true;
        return HttpResponse.json({ released: true });
      }),
    );
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );
    await screen.findByText(/Reserva expira em/);

    fireEvent.click(
      screen.getByRole('button', { name: 'Desistir da reserva' }),
    );
    await vi.waitFor(() => expect(released).toBe(true));
    expect(screen.queryByText(/Reserva expira em/)).not.toBeInTheDocument();
  });

  it('releases the previous hold when selecting a different seat', async () => {
    useSeatmap();
    let gets = 0;
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
        gets += 1;
        return HttpResponse.json(seatmapPayload);
      }),
    );
    const heldLabels: string[] = [];
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
    );
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
    await screen.findByText(/Reserva expira em/);

    fireEvent.click(screen.getByRole('button', { name: 'Cadeira 7, fila A' }));
    await vi.waitFor(() =>
      expect(screen.getByText(/Cadeira 7/)).toBeInTheDocument(),
    );
    await vi.waitFor(() => expect(releasedLabels).toContain('6'));
    expect(heldLabels).toEqual(['6', '7']);
    expect(screen.queryByText(/Cadeira 6/)).not.toBeInTheDocument();

    // Give up the new hold; a later seatmap GET that only lists the old
    // seat must not resurrect it as a zombie selection.
    fireEvent.click(
      screen.getByRole('button', { name: 'Desistir da reserva' }),
    );
    gets = 0;
    server.use(
      http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () => {
        gets += 1;
        return HttpResponse.json(seatmapPayload);
      }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(/Cadeira 7/)).not.toBeInTheDocument(),
    );
    await vi.waitFor(() => expect(gets).toBeGreaterThan(0));
    expect(screen.queryByText(/Cadeira 6/)).not.toBeInTheDocument();
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

  it('reverts the selection when the seat was just taken', async () => {
    useSeatmap();
    useHold('6', 409);
    render(<SeatMap eventSlug="o-fantasma-da-opera" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadeira 6, fila A' }),
    );

    expect(
      await screen.findByText(
        'Este assento acabou de ser reservado por outro comprador.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
      ),
    ).not.toBeInTheDocument();
  });

  it('signs in anonymously and retries when the hold gets a 401', async () => {
    useSeatmap();
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

    expect(
      await screen.findByText(
        'Você selecionou: Plateia · Fila A · Cadeira 6 · R$ 120,00',
      ),
    ).toBeInTheDocument();
    expect(anonymousCalls).toBe(1);
    expect(holdCalls).toBe(2);
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
});
