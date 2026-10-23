import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  type OrganizerEventDetailDto,
  organizerLotCreateSchema,
  organizerRowCreateSchema,
  organizerSectorCreateSchema,
} from '@ticketvibe/shared';
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

const { OrganizerSectorEditor } = await import('./organizer-sector-editor');

const server = setupServer();

const eventId = '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
const setorId = '4f4f4f4f-4f4f-4f4f-8f4f-4f4f4f4f4f4f';
const filaAId = '5f5f5f5f-5f5f-4f5f-8f5f-5f5f5f5f5f5f';
const filaBId = '6f6f6f6f-6f6f-4f6f-8f6f-6f6f6f6f6f6f';
const lotId = '7f7f7f7f-7f7f-4f7f-8f7f-7f7f7f7f7f7f';

const evento = {
  id: eventId,
  slug: 'rock-night',
  title: 'Rock Night',
  description: 'Uma noite de rock com bandas convidadas.',
  category: { slug: 'shows', name: 'Shows' },
  venue: {
    slug: 'audio-club',
    name: 'Audio Club',
    city: 'São Paulo',
    state: 'SP',
  },
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

function renderEditor() {
  const onChanged = vi.fn();
  render(<OrganizerSectorEditor event={evento} onChanged={onChanged} />);
  return { onChanged };
}

describe('OrganizerSectorEditor', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('lista setores com filas, contagem de lugares, lotes com vigência e os formulários de ação', () => {
    renderEditor();

    const setor = screen.getByRole('listitem', { name: 'Plateia' });
    expect(
      within(setor).getByRole('heading', { name: 'Plateia' }),
    ).toBeInTheDocument();
    expect(within(setor).getByText('R$ 80,00')).toBeInTheDocument();
    expect(within(setor).getByText('20 lugares')).toBeInTheDocument();
    expect(within(setor).getByText('Fila A · 12 lugares')).toBeInTheDocument();
    expect(within(setor).getByText('Fila B · 8 lugares')).toBeInTheDocument();
    expect(
      within(setor).getByRole('button', { name: 'Excluir fila A' }),
    ).toBeInTheDocument();
    expect(
      within(setor).getByRole('button', { name: 'Excluir fila B' }),
    ).toBeInTheDocument();

    const lote = within(setor).getByRole('listitem', {
      name: 'Lote Primeiro lote',
    });
    expect(within(lote).getByText('R$ 100,00')).toBeInTheDocument();
    expect(
      within(lote).getByText('Vigência 01/11 – 10/11'),
    ).toBeInTheDocument();
    expect(
      within(lote).getByRole('button', { name: 'Excluir lote Primeiro lote' }),
    ).toBeInTheDocument();

    expect(
      within(setor).getByRole('form', { name: 'Adicionar fila — Plateia' }),
    ).toBeInTheDocument();
    expect(
      within(setor).getByRole('form', { name: 'Criar lote — Plateia' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Criar setor' }),
    ).toBeInTheDocument();
  });

  it('cria setor com duas filas e avisa a página para recarregar o evento', async () => {
    const { onChanged } = renderEditor();

    let received: unknown;
    server.use(
      http.post(
        new RegExp(`/api/organizer/events/${eventId}/sectors$`),
        async (info) => {
          received = await info.request.json();
          return HttpResponse.json(
            { sector: { ...evento.sectors[0], id: setorId } },
            { status: 201 },
          );
        },
      ),
    );

    const criarSetor = screen.getByRole('region', { name: 'Criar setor' });
    fireEvent.change(within(criarSetor).getByLabelText('Nome do setor'), {
      target: { value: 'Plateia VIP' },
    });
    fireEvent.change(within(criarSetor).getByLabelText('Preço base'), {
      target: { value: '120' },
    });
    fireEvent.click(
      within(criarSetor).getByRole('button', { name: 'Adicionar fila' }),
    );

    const nomes = within(criarSetor).getAllByLabelText('Nome da fila');
    expect(nomes).toHaveLength(2);
    fireEvent.change(nomes[0], { target: { value: 'A' } });
    fireEvent.change(nomes[1], { target: { value: 'B' } });

    const lugares = within(criarSetor).getAllByLabelText('Lugares');
    fireEvent.change(lugares[0], { target: { value: '12' } });
    fireEvent.change(lugares[1], { target: { value: '8' } });

    fireEvent.click(
      within(criarSetor).getByRole('button', { name: 'Criar setor' }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const parsed = organizerSectorCreateSchema.parse(received);
    expect(parsed.name).toBe('Plateia VIP');
    expect(parsed.priceFromCents).toBe(12000);
    expect(parsed.rows).toEqual([
      { label: 'A', seatCount: 12 },
      { label: 'B', seatCount: 8 },
    ]);
  });

  it('mostra o conflito de nome de fila ao criar setor', async () => {
    const { onChanged } = renderEditor();

    server.use(
      http.post(new RegExp(`/api/organizer/events/${eventId}/sectors$`), () =>
        HttpResponse.json({ error: 'row_label_conflict' }, { status: 409 }),
      ),
    );

    const criarSetor = screen.getByRole('region', { name: 'Criar setor' });
    fireEvent.change(within(criarSetor).getByLabelText('Nome do setor'), {
      target: { value: 'Plateia VIP' },
    });
    fireEvent.change(within(criarSetor).getByLabelText('Preço base'), {
      target: { value: '120' },
    });
    const nomes = within(criarSetor).getAllByLabelText('Nome da fila');
    fireEvent.change(nomes[0], { target: { value: 'A' } });
    const lugares = within(criarSetor).getAllByLabelText('Lugares');
    fireEvent.change(lugares[0], { target: { value: '12' } });

    fireEvent.click(
      within(criarSetor).getByRole('button', { name: 'Criar setor' }),
    );

    expect(
      await screen.findByText('Já existe uma fila com esse nome neste setor.'),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('adiciona fila em um setor existente e avisa a página', async () => {
    const { onChanged } = renderEditor();

    let received: unknown;
    let requestedPath = '';
    server.use(
      http.post(/\/api\/organizer\/sectors\/[^/]+\/rows$/, async (info) => {
        requestedPath = new URL(info.request.url).pathname;
        received = await info.request.json();
        return HttpResponse.json(
          { sector: { ...evento.sectors[0] } },
          { status: 201 },
        );
      }),
    );

    const setor = screen.getByRole('listitem', { name: 'Plateia' });
    fireEvent.change(within(setor).getByLabelText('Nome da fila'), {
      target: { value: 'C' },
    });
    fireEvent.change(within(setor).getByLabelText('Lugares'), {
      target: { value: '6' },
    });
    fireEvent.click(
      within(setor).getByRole('button', { name: 'Adicionar fila' }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const parsed = organizerRowCreateSchema.parse(received);
    expect(parsed).toEqual({ label: 'C', seatCount: 6 });
    expect(requestedPath).toBe(`/api/organizer/sectors/${setorId}/rows`);
  });

  it('exclui fila de um setor e avisa a página', async () => {
    const { onChanged } = renderEditor();

    let requestedPath = '';
    server.use(
      http.delete(/\/api\/organizer\/rows\/[^/]+$/, ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila A' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(requestedPath).toBe(`/api/organizer/rows/${filaAId}`);
  });

  it('mostra ingressos vendidos ao tentar excluir fila com pedidos', async () => {
    const { onChanged } = renderEditor();

    server.use(
      http.delete(/\/api\/organizer\/rows\/[^/]+$/, () =>
        HttpResponse.json({ error: 'row_has_orders' }, { status: 409 }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Excluir fila A' }));

    expect(
      await screen.findByText('Há ingressos vendidos nessa fila.'),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('cria lote com período de venda e avisa a página', async () => {
    const { onChanged } = renderEditor();

    let received: unknown;
    let requestedPath = '';
    server.use(
      http.post(/\/api\/organizer\/sectors\/[^/]+\/lots$/, async (info) => {
        requestedPath = new URL(info.request.url).pathname;
        received = await info.request.json();
        return HttpResponse.json(
          { lot: { ...evento.sectors[0].lots[0] } },
          { status: 201 },
        );
      }),
    );

    const setor = screen.getByRole('listitem', { name: 'Plateia' });
    fireEvent.change(within(setor).getByLabelText('Nome do lote'), {
      target: { value: 'Segundo lote' },
    });
    fireEvent.change(within(setor).getByLabelText('Preço'), {
      target: { value: '150' },
    });
    fireEvent.change(within(setor).getByLabelText('Início da venda'), {
      target: { value: '2026-11-11T10:00' },
    });
    fireEvent.change(within(setor).getByLabelText('Fim da venda'), {
      target: { value: '2026-11-19T23:59' },
    });
    fireEvent.click(within(setor).getByRole('button', { name: 'Criar lote' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const parsed = organizerLotCreateSchema.parse(received);
    expect(parsed).toEqual({
      name: 'Segundo lote',
      priceCents: 15000,
      startsAt: new Date('2026-11-11T10:00').toISOString(),
      endsAt: new Date('2026-11-19T23:59').toISOString(),
    });
    expect(requestedPath).toBe(`/api/organizer/sectors/${setorId}/lots`);
  });

  it('mostra o conflito de período ao criar lote', async () => {
    const { onChanged } = renderEditor();

    server.use(
      http.post(/\/api\/organizer\/sectors\/[^/]+\/lots$/, () =>
        HttpResponse.json({ error: 'lot_overlaps' }, { status: 409 }),
      ),
    );

    const setor = screen.getByRole('listitem', { name: 'Plateia' });
    fireEvent.change(within(setor).getByLabelText('Nome do lote'), {
      target: { value: 'Segundo lote' },
    });
    fireEvent.change(within(setor).getByLabelText('Preço'), {
      target: { value: '150' },
    });
    fireEvent.change(within(setor).getByLabelText('Início da venda'), {
      target: { value: '2026-11-11T10:00' },
    });
    fireEvent.change(within(setor).getByLabelText('Fim da venda'), {
      target: { value: '2026-11-19T23:59' },
    });
    fireEvent.click(within(setor).getByRole('button', { name: 'Criar lote' }));

    expect(
      await screen.findByText('Setor já tem um lote nesse período.'),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('exclui lote de um setor e avisa a página', async () => {
    const { onChanged } = renderEditor();

    let requestedPath = '';
    server.use(
      http.delete(/\/api\/organizer\/lots\/[^/]+$/, ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Excluir lote Primeiro lote' }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(requestedPath).toBe(`/api/organizer/lots/${lotId}`);
  });
});
