import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { organizerEventCreateSchema } from '@ticketvibe/shared';
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

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const server = setupServer();

const eventoId = '3e3e3e3e-3e3e-4e3e-8e3e-3e3e3e3e3e3e';

const audioClub = {
  id: '4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e4e',
  slug: 'audio-club',
  name: 'Audio Club',
  city: 'São Paulo',
  state: 'SP',
};

const eventoCriado = {
  id: eventoId,
  slug: 'rock-night',
  title: 'Rock Night',
  description: 'Uma noite de rock com bandas convidadas.',
  category: { slug: 'shows', name: 'Shows' },
  venue: audioClub,
  startsAt: '2026-11-20T20:00:00.000Z',
  priceFromCents: 8000,
  platform: false,
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});

afterAll(() => server.close());

async function renderNovoEventoPage() {
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
  );

  const NovoEventoPage = (await import('./page')).default;

  render(await NovoEventoPage());

  await screen.findByRole('option', { name: 'Audio Club' });
}

function preencherFormulario() {
  fireEvent.change(screen.getByLabelText('Título'), {
    target: { value: 'Rock Night' },
  });
  fireEvent.change(screen.getByLabelText('Descrição'), {
    target: { value: 'Uma noite de rock com bandas convidadas.' },
  });
  fireEvent.change(screen.getByLabelText('Categoria'), {
    target: { value: 'shows' },
  });
  fireEvent.change(screen.getByLabelText('Local'), {
    target: { value: 'audio-club' },
  });
  fireEvent.change(screen.getByLabelText('Data e hora'), {
    target: { value: '2026-11-20T20:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar evento' }));
}

describe('página Novo evento', () => {
  it('renderiza o formulário com categorias, locais e o link Cadastrar local', async () => {
    await renderNovoEventoPage();

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
    expect(screen.getByLabelText('Data e hora')).toBeInTheDocument();

    const categorias = screen.getByLabelText('Categoria');
    expect(
      within(categorias).getByRole('option', { name: 'Shows' }),
    ).toBeInTheDocument();
    expect(
      within(categorias).getByRole('option', { name: 'Comédia' }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('link', { name: 'Cadastrar local' }),
    ).toHaveAttribute('href', '/organizador/locais');
  });

  it('cria o evento e redireciona para o detalhe', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/organizer\/events$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ event: eventoCriado }, { status: 201 });
      }),
    );

    await renderNovoEventoPage();
    preencherFormulario();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/organizador/eventos/${eventoId}`),
    );

    const parsed = organizerEventCreateSchema.parse(received);
    expect(parsed.title).toBe('Rock Night');
    expect(parsed.description).toBe('Uma noite de rock com bandas convidadas.');
    expect(parsed.categorySlug).toBe('shows');
    expect(parsed.venueSlug).toBe('audio-club');
    expect(parsed.startsAt).toBe(new Date('2026-11-20T20:00').toISOString());
  });

  it('mostra o erro de validação do upstream em pt-BR', async () => {
    server.use(
      http.post(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ error: 'invalid_body' }, { status: 400 }),
      ),
    );

    await renderNovoEventoPage();
    preencherFormulario();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verifique os dados informados e tente novamente.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('mostra a mensagem genérica para um código de erro desconhecido', async () => {
    server.use(
      http.post(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    await renderNovoEventoPage();
    preencherFormulario();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocorreu um erro inesperado. Tente novamente.',
    );
  });
});
