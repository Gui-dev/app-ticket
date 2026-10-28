import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  type OrganizerEventDetailDto,
  organizerEventCreateSchema,
} from '@ticketvibe/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { fromDateTimeLocalValue } from '@/lib/format';

const EditarEventoPage = (await import('./page')).default;

const server = setupServer();

const eventId = '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
const setorId = '4f4f4f4f-4f4f-4f4f-8f4f-4f4f4f4f4f4f';
const filaAId = '5f5f5f5f-5f5f-4f5f-8f5f-5f5f5f5f5f5f';
const filaBId = '6f6f6f6f-6f6f-4f6f-8f6f-6f6f6f6f6f6f';
const lotId = '7f7f7f7f-7f7f-4f7f-8f7f-7f7f7f7f7f7f';

const detailUrl = /\/api\/organizer\/events\/[^/]+$/;

const audioClub = {
  id: '4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e4e',
  slug: 'audio-club',
  name: 'Audio Club',
  city: 'São Paulo',
  state: 'SP',
};

function montarEvento() {
  return {
    id: eventId,
    slug: 'rock-night',
    title: 'Rock Night',
    description: 'Uma noite de rock com bandas convidadas.',
    category: { slug: 'shows', name: 'Shows' },
    venue: audioClub,
    startsAt: '2026-11-20T23:00:00.000Z',
    priceFromCents: 8000,
    platform: false,
    sectors: [
      {
        id: setorId,
        slug: 'plateia',
        name: 'Plateia',
        priceFromCents: 8000,
        seatsTotal: 20,
        rows: [
          { id: filaAId, label: 'A', seatCount: 12 },
          { id: filaBId, label: 'B', seatCount: 8 },
        ],
        lots: [
          {
            id: lotId,
            name: 'Primeiro lote',
            priceCents: 10000,
            startsAt: '2026-11-01T15:00:00.000Z',
            endsAt: '2026-11-10T15:00:00.000Z',
          },
        ],
      },
    ],
  } satisfies OrganizerEventDetailDto;
}

async function renderEditarEventoPage() {
  let detailCalls = 0;
  const evento = montarEvento();

  server.use(
    http.get('http://localhost:3001/categories', () =>
      HttpResponse.json({
        categories: [
          { slug: 'shows', name: 'Shows' },
          { slug: 'comedy', name: 'Comédia' },
        ],
      }),
    ),
    http.get(/\/api\/organizer\/venues$/, () =>
      HttpResponse.json({ venues: [audioClub] }),
    ),
    http.get(detailUrl, () => {
      detailCalls += 1;
      return HttpResponse.json({ event: evento });
    }),
  );

  render(await EditarEventoPage({ params: Promise.resolve({ id: eventId }) }));

  await screen.findByRole('option', { name: 'Audio Club' });

  return { detalheCalls: () => detailCalls };
}

describe('página Editar evento', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('renderiza o formulário com dados iniciais, setores, filas e lotes', async () => {
    await renderEditarEventoPage();

    expect(
      screen.getByRole('heading', { name: 'Editar evento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('URL é fixada no primeiro cadastro: /events/rock-night'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Rock Night');
    expect(screen.getByLabelText('Descrição')).toHaveValue(
      'Uma noite de rock com bandas convidadas.',
    );

    const categorias = screen.getByLabelText('Categoria');
    expect(
      within(categorias).getByRole('option', { name: 'Shows' }),
    ).toBeInTheDocument();
    expect(
      within(categorias).getByRole('option', { name: 'Comédia' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toHaveValue('shows');

    expect(screen.getByLabelText('Data e hora')).toHaveValue(
      '2026-11-20T20:00',
    );
    expect(screen.getByLabelText('Janela de cancelamento (horas)')).toHaveValue(
      24,
    );
    expect(screen.getByLabelText('Reembolso (%)')).toHaveValue(100);

    const setor = screen.getByRole('listitem', { name: 'Plateia' });
    expect(
      within(setor).getByRole('heading', { name: 'Plateia' }),
    ).toBeInTheDocument();
    expect(within(setor).getByText('Fila A · 12 lugares')).toBeInTheDocument();
    expect(within(setor).getByText('Fila B · 8 lugares')).toBeInTheDocument();
    expect(
      within(setor).getByText('Vigência 01/11 – 10/11'),
    ).toBeInTheDocument();
  });

  it('salva as alterações do evento com PATCH do corpo completo e recarrega o detalhe', async () => {
    const { detalheCalls } = await renderEditarEventoPage();

    let received: unknown;
    server.use(
      http.patch(detailUrl, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({
          event: { ...montarEvento(), title: 'Rock Night 2026' },
        });
      }),
    );

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Rock Night 2026' },
    });
    fireEvent.change(screen.getByLabelText('Data e hora'), {
      target: { value: '2026-11-21T21:00' },
    });
    fireEvent.change(screen.getByLabelText('Janela de cancelamento (horas)'), {
      target: { value: '120' },
    });
    fireEvent.change(screen.getByLabelText('Reembolso (%)'), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(detalheCalls()).toBe(2));

    const parsed = organizerEventCreateSchema.parse(received);
    expect(parsed.title).toBe('Rock Night 2026');
    expect(parsed.description).toBe('Uma noite de rock com bandas convidadas.');
    expect(parsed.categorySlug).toBe('shows');
    expect(parsed.venueSlug).toBe('audio-club');
    expect(parsed.startsAt).toBe(fromDateTimeLocalValue('2026-11-21T21:00'));
    expect(parsed.cancellationWindowHours).toBe(120);
    expect(parsed.refundPercent).toBe(80);
  });

  it('mostra os valores da política de cancelamento quando o evento traz os campos', async () => {
    server.use(
      http.get(/\/api\/organizer\/venues$/, () =>
        HttpResponse.json({ venues: [audioClub] }),
      ),
      http.get('http://localhost:3001/categories', () =>
        HttpResponse.json({ categories: [] }),
      ),
      http.get(detailUrl, () =>
        HttpResponse.json({
          event: {
            ...montarEvento(),
            cancellationWindowHours: 72,
            refundPercent: 50,
          },
        }),
      ),
    );

    render(
      await EditarEventoPage({ params: Promise.resolve({ id: eventId }) }),
    );

    expect(
      await screen.findByLabelText('Janela de cancelamento (horas)'),
    ).toHaveValue(72);
    expect(screen.getByLabelText('Reembolso (%)')).toHaveValue(50);
  });

  it('usa 24 e 100 como padrões da política quando o evento não traz os campos', async () => {
    const { detalheCalls } = await renderEditarEventoPage();

    let received: unknown;
    server.use(
      http.patch(detailUrl, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ event: montarEvento() });
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(detalheCalls()).toBe(2));

    const parsed = organizerEventCreateSchema.parse(received);
    expect(parsed.cancellationWindowHours).toBe(24);
    expect(parsed.refundPercent).toBe(100);
  });

  it('mantém o instante do evento quando a data só é salva sem alteração', async () => {
    const { detalheCalls } = await renderEditarEventoPage();

    let received: unknown;
    server.use(
      http.patch(detailUrl, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ event: montarEvento() });
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(detalheCalls()).toBe(2));

    const parsed = organizerEventCreateSchema.parse(received);
    expect(parsed.startsAt).toBe('2026-11-20T23:00:00.000Z');
  });

  it('mostra o erro quando o PATCH é recusado por event_has_orders e não recarrega', async () => {
    const { detalheCalls } = await renderEditarEventoPage();

    server.use(
      http.patch(detailUrl, () =>
        HttpResponse.json({ error: 'event_has_orders' }, { status: 409 }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Rock Night 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(
        'Não é possível alterar este evento porque ele já tem pedidos.',
      ),
    ).toBeInTheDocument();
    expect(detalheCalls()).toBe(1);
  });

  it('mostra o erro quando o evento não existe', async () => {
    server.use(
      http.get(detailUrl, () =>
        HttpResponse.json({ error: 'event_not_found' }, { status: 404 }),
      ),
    );

    render(
      await EditarEventoPage({ params: Promise.resolve({ id: eventId }) }),
    );

    expect(
      await screen.findByText('Evento não encontrado.'),
    ).toBeInTheDocument();
  });

  it('mostra o erro genérico quando o carregamento do detalhe falha', async () => {
    server.use(
      http.get(detailUrl, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(
      await EditarEventoPage({ params: Promise.resolve({ id: eventId }) }),
    );

    expect(
      await screen.findByText('Ocorreu um erro inesperado. Tente novamente.'),
    ).toBeInTheDocument();
  });
});
