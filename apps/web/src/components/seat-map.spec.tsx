import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
};

function useSeatmap() {
  server.use(
    http.get(/\/api\/events\/o-fantasma-da-opera\/seatmap$/, () =>
      HttpResponse.json(seatmapPayload),
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
    expect(screen.getByText(/4 de 6 livres/)).toBeInTheDocument();

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
});
