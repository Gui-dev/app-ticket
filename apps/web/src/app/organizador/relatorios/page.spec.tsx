import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RelatoriosPage = (await import('./page')).default;

const server = setupServer();

const eventoDaPlataforma = {
  id: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e',
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
  platform: true,
};

const eventoDoOrganizador = {
  ...eventoDaPlataforma,
  id: '2e2e2e2e-2e2e-4e2e-8e2e-2e2e2e2e2e2e',
  slug: 'festa-do-livro',
  title: 'Festa do Livro',
  platform: false,
};

const relatorioComVendas = {
  eventId: eventoDoOrganizador.id,
  from: null,
  to: null,
  ticketsSold: 3,
  ordersCount: 2,
  grossCents: 25000,
  platformFeeCents: 2500,
  netCents: 22500,
};

const relatorioSemVendas = {
  eventId: eventoDoOrganizador.id,
  from: null,
  to: null,
  ticketsSold: 0,
  ordersCount: 0,
  grossCents: 0,
  platformFeeCents: 0,
  netCents: 0,
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => server.close());

async function renderComEventos() {
  server.use(
    http.get(/\/api\/organizer\/events$/, () =>
      HttpResponse.json({
        events: [eventoDaPlataforma, eventoDoOrganizador],
      }),
    ),
  );
  server.use(
    http.get(/\/api\/organizer\/events\/[^/]+\/report/, () =>
      HttpResponse.json({ report: relatorioComVendas }),
    ),
  );

  render(<RelatoriosPage />);

  await screen.findByText('Festa do Livro');
}

describe('página Relatórios', () => {
  it('renderiza os KPIs a partir do relatório ao selecionar um evento', async () => {
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });

    await screen.findByText('Ingressos vendidos');
    expect(screen.getByText('Pedidos pagos')).toBeInTheDocument();
    expect(screen.getByText('Faturamento bruto')).toBeInTheDocument();
    expect(screen.getByText('Taxa da plataforma')).toBeInTheDocument();
    expect(screen.getByText('Líquido do evento')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('R$ 250,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 25,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 225,00')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o evento não tem vendas no período', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.get(/\/api\/organizer\/events\/[^/]+\/report/, () =>
        HttpResponse.json({ report: relatorioSemVendas }),
      ),
    );

    render(<RelatoriosPage />);

    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });

    expect(
      await screen.findByText('Nenhuma venda no período.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Ingressos vendidos')).not.toBeInTheDocument();
  });

  it('lista no select apenas os eventos do organizador, sem eventos da plataforma', async () => {
    await renderComEventos();

    const select = screen.getByLabelText('Evento');
    const optionsBase = select.querySelectorAll('option');
    const labels = Array.from(optionsBase).map((option) => option.textContent);

    expect(labels).toEqual(['Selecione um evento', 'Festa do Livro']);
    expect(labels).not.toContain('Rock Night');
  });

  it('mostra o estado vazio quando o organizador não tem eventos próprios', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDaPlataforma] }),
      ),
    );

    render(<RelatoriosPage />);

    expect(
      await screen.findByText('Nenhum evento do organizador ainda.'),
    ).toBeInTheDocument();
  });

  it('aplica o período e inclui os instantes convertidos na consulta', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.get(/\/api\/organizer\/events\/[^/]+\/report/, (info) => {
        requests.push(new URL(info.request.url));
        return HttpResponse.json({ report: relatorioComVendas });
      }),
    );

    render(<RelatoriosPage />);

    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    await screen.findByText('Ingressos vendidos');

    fireEvent.change(screen.getByLabelText('De'), {
      target: { value: '2026-01-01T00:00' },
    });
    fireEvent.change(screen.getByLabelText('Até'), {
      target: { value: '2026-01-31T23:59' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() =>
      expect(requests.some((request) => request.searchParams.has('from'))).toBe(
        true,
      ),
    );
    const applied = requests[requests.length - 1];
    expect(applied.searchParams.get('from')).toBe('2026-01-01T03:00:00.000Z');
    expect(applied.searchParams.get('to')).toBe('2026-02-01T02:59:00.000Z');
  });

  it('omite o parâmetro from quando o campo De fica vazio', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.get(/\/api\/organizer\/events\/[^/]+\/report/, (info) => {
        requests.push(new URL(info.request.url));
        return HttpResponse.json({ report: relatorioComVendas });
      }),
    );

    render(<RelatoriosPage />);

    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    await screen.findByText('Ingressos vendidos');

    fireEvent.change(screen.getByLabelText('Até'), {
      target: { value: '2026-01-31T23:59' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() =>
      expect(requests.some((request) => request.searchParams.has('to'))).toBe(
        true,
      ),
    );
    const applied = requests[requests.length - 1];
    expect(applied.searchParams.has('from')).toBe(false);
    expect(applied.searchParams.get('to')).toBe('2026-02-01T02:59:00.000Z');
  });

  it('mostra a mensagem de erro genérica com prefixo quando o relatório falha', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.get(/\/api\/organizer\/events\/[^/]+\/report/, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<RelatoriosPage />);

    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o relatório.',
    );
  });

  it('mostra a mensagem mapeada de período inválido', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.get(/\/api\/organizer\/events\/[^/]+\/report/, () =>
        HttpResponse.json({ error: 'invalid_query' }, { status: 400 }),
      ),
    );

    render(<RelatoriosPage />);

    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Período inválido.',
    );
  });
});
