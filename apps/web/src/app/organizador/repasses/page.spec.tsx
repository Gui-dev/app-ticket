import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const RepassesPage = (await import('./page')).default;

const server = setupServer();

const onboardingUrl = 'https://connect.stripe.com/onboarding';
const ordemDaFila = '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';

const repasses = [
  {
    orderId: '11111111-1111-4111-8111-111111111111',
    eventTitle: 'Festa do Livro',
    eventSlug: 'festa-do-livro',
    grossCents: 10000,
    platformFeeCents: 1000,
    organizerNetCents: 9000,
    transferStatus: 'none',
    createdAt: '2026-10-20T12:00:00.000Z',
  },
  {
    orderId: '22222222-2222-4222-8222-222222222222',
    eventTitle: 'Festa do Livro',
    eventSlug: 'festa-do-livro',
    grossCents: 20000,
    platformFeeCents: 2000,
    organizerNetCents: 18000,
    transferStatus: 'pending',
    createdAt: '2026-10-21T12:00:00.000Z',
  },
  {
    orderId: '33333333-3333-4333-8333-333333333333',
    eventTitle: 'Festa do Livro',
    eventSlug: 'festa-do-livro',
    grossCents: 30000,
    platformFeeCents: 3000,
    organizerNetCents: 27000,
    transferStatus: 'succeeded',
    createdAt: '2026-10-22T12:00:00.000Z',
  },
  {
    orderId: ordemDaFila,
    eventTitle: 'Festa do Livro',
    eventSlug: 'festa-do-livro',
    grossCents: 40000,
    platformFeeCents: 4000,
    organizerNetCents: 36000,
    transferStatus: 'failed',
    createdAt: '2026-10-23T12:00:00.000Z',
  },
  {
    orderId: '55555555-5555-4555-8555-555555555555',
    eventTitle: 'Festa do Livro',
    eventSlug: 'festa-do-livro',
    grossCents: 50000,
    platformFeeCents: 5000,
    organizerNetCents: 45000,
    transferStatus: 'skipped',
    createdAt: '2026-10-24T12:00:00.000Z',
  },
];

const connectStatus = { current: { connected: false, payoutsEnabled: false } };
const listaDeRepasses = { current: [repasses[3]] };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  connectStatus.current = { connected: false, payoutsEnabled: false };
  listaDeRepasses.current = [repasses[3]];
  server.use(
    http.get(/\/api\/organizer\/payments\/connect$/, () =>
      HttpResponse.json(connectStatus.current),
    ),
    http.post(/\/api\/organizer\/payments\/connect$/, () =>
      HttpResponse.json({ onboardingUrl }),
    ),
    http.get(/\/api\/organizer\/payments\/transfers$/, () =>
      HttpResponse.json({ transfers: listaDeRepasses.current }),
    ),
  );
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => server.close());

describe('página Repasses', () => {
  it('mostra o pill desconectado e a âncora Conectar Stripe com a URL de onboarding quando não há conta', async () => {
    render(<RepassesPage />);

    expect(await screen.findByText('Não conectado')).toBeInTheDocument();
    const anchor = await screen.findByRole('link', { name: 'Conectar Stripe' });
    expect(anchor).toHaveAttribute('href', onboardingUrl);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor.getAttribute('rel')).toContain('noopener');
    expect(anchor.getAttribute('rel')).toContain('noreferrer');
  });

  it('mostra o pill de conta conectada e omite o link quando já há conexão', async () => {
    connectStatus.current = { connected: true, payoutsEnabled: true };
    const connectPosts: string[] = [];
    server.use(
      http.post(/\/api\/organizer\/payments\/connect$/, (info) => {
        connectPosts.push(new URL(info.request.url).pathname);
        return HttpResponse.json({ error: 'unexpected_call' }, { status: 500 });
      }),
    );

    render(<RepassesPage />);

    expect(
      await screen.findByText('Conta conectada; repasse automático'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Não conectado')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Conectar Stripe' }),
    ).not.toBeInTheDocument();
    expect(connectPosts).toHaveLength(0);
  });

  it('mostra o pill desconectado e o link quando a conta existe mas ainda não pode receber repasses', async () => {
    connectStatus.current = { connected: true, payoutsEnabled: false };
    const connectPosts: string[] = [];
    server.use(
      http.post(/\/api\/organizer\/payments\/connect$/, (info) => {
        connectPosts.push(new URL(info.request.url).pathname);
        return HttpResponse.json({ onboardingUrl });
      }),
    );

    render(<RepassesPage />);

    expect(await screen.findByText('Não conectado')).toBeInTheDocument();
    const anchor = await screen.findByRole('link', { name: 'Conectar Stripe' });
    expect(anchor).toHaveAttribute('href', onboardingUrl);
    await waitFor(() => expect(connectPosts).toHaveLength(1));
    expect(
      screen.queryByText('Conta conectada; repasse automático'),
    ).not.toBeInTheDocument();
  });

  it('renderiza a tabela com bruto, taxa, líquido e rótulos de status de cada linha', async () => {
    listaDeRepasses.current = repasses;

    render(<RepassesPage />);

    await screen.findByRole('table');
    expect(screen.getByText('Bruto')).toBeInTheDocument();
    expect(screen.getByText('Taxa da plataforma')).toBeInTheDocument();
    expect(screen.getByText('Líquido do organizador')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 10,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 90,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 270,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 400,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 40,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 360,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 450,00')).toBeInTheDocument();
    expect(screen.getByText('Sem repasse')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Repasse enviado')).toBeInTheDocument();
    expect(screen.getByText('Falha no repasse')).toBeInTheDocument();
    expect(screen.getByText('Não aplicável')).toBeInTheDocument();
  });

  it('mostra o botão Reprocessar repasse apenas na linha com falha de repasse', async () => {
    listaDeRepasses.current = repasses;

    render(<RepassesPage />);

    await screen.findByRole('table');

    expect(
      screen.getAllByRole('button', { name: 'Reprocessar repasse' }),
    ).toHaveLength(1);
  });

  it('reprocessa o repasse com falha e recarrega a lista', async () => {
    const retries: string[] = [];
    server.use(
      http.post(
        /\/api\/organizer\/payments\/transfers\/[^/]+\/retry$/,
        (info) => {
          retries.push(new URL(info.request.url).pathname);
          listaDeRepasses.current = [
            { ...repasses[3], transferStatus: 'succeeded' },
          ];
          return HttpResponse.json({ transferStatus: 'succeeded' });
        },
      ),
    );

    render(<RepassesPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reprocessar repasse' }),
    );

    await waitFor(() => expect(retries).toHaveLength(1));
    expect(retries[0]).toContain(ordemDaFila);
    expect(await screen.findByText('Repasse enviado')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reprocessar repasse' }),
    ).not.toBeInTheDocument();
  });

  it('mostra um alerta genérico quando o reprocessamento falha', async () => {
    server.use(
      http.post(/\/api\/organizer\/payments\/transfers\/[^/]+\/retry$/, () =>
        HttpResponse.json({ error: 'transfer_not_retryable' }, { status: 409 }),
      ),
    );

    render(<RepassesPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reprocessar repasse' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível reprocessar o repasse agora. Tente novamente.',
    );
  });

  it('mostra o estado vazio quando o organizador não tem repasses', async () => {
    listaDeRepasses.current = [];

    render(<RepassesPage />);

    expect(
      await screen.findByText('Nenhum repasse ainda.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('recarrega o status de conexão quando a aba volta ao foco', async () => {
    render(<RepassesPage />);

    await screen.findByText('Não conectado');

    connectStatus.current = { connected: true, payoutsEnabled: true };
    fireEvent(document, new Event('visibilitychange'));

    expect(
      await screen.findByText('Conta conectada; repasse automático'),
    ).toBeInTheDocument();
  });

  it('mostra a mensagem de erro quando o carregamento dos repasses falha', async () => {
    server.use(
      http.get(/\/api\/organizer\/payments\/transfers$/, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<RepassesPage />);

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível carregar os repasses.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
