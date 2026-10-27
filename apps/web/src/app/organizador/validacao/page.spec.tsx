import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const scannerStub = vi.hoisted(() => {
  type StubProps = {
    onCode: (code: string) => void;
    onCameraError: () => void;
  };
  const handlers: Partial<StubProps> = {};
  function Stub(props: StubProps) {
    handlers.onCode = props.onCode;
    handlers.onCameraError = props.onCameraError;
    return null;
  }
  return { handlers, Stub };
});

vi.mock('@/components/qr-scanner', () => ({
  QrScanner: scannerStub.Stub,
}));

const ValidacaoPage = (await import('./page')).default;

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

type RequisicaoValidacao = {
  url: string;
  method: string;
  body: unknown;
};

const requisicoesValidacao: RequisicaoValidacao[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  requisicoesValidacao.length = 0;
  server.resetHandlers();
});

afterAll(() => server.close());

function handlerDeValidacao(
  resposta: Record<string, unknown>,
  status = 200,
): RequisicaoValidacao[] | undefined {
  server.use(
    http.post(
      /\/api\/organizer\/events\/[^/]+\/tickets\/validate/,
      async (info) => {
        requisicoesValidacao.push({
          url: info.request.url,
          method: info.request.method,
          body: await info.request.json(),
        });
        return HttpResponse.json(resposta, { status });
      },
    ),
  );
  return undefined;
}

const vereditoValido = {
  validation: {
    result: 'valid',
    usedAt: null,
    usedBy: null,
    sectorName: 'Setor A',
    rowLabel: 'B',
    seatLabel: '12',
  },
};

const vereditoUsado = {
  validation: {
    result: 'already_used',
    usedAt: '2026-11-20T23:30:00.000Z',
    usedBy: 'Pedro Alves',
    sectorName: 'Setor A',
    rowLabel: 'B',
    seatLabel: '12',
  },
};

const vereditoInvalido = {
  validation: {
    result: 'invalid',
    usedAt: null,
    usedBy: null,
    sectorName: null,
    rowLabel: null,
    seatLabel: null,
  },
};

async function renderComEventos(
  eventos = [eventoDaPlataforma, eventoDoOrganizador],
) {
  server.use(
    http.get(/\/api\/organizer\/events$/, () =>
      HttpResponse.json({ events: eventos }),
    ),
  );
  render(<ValidacaoPage />);
  await screen.findByText('Festa do Livro');
}

describe('página Validação de ingressos', () => {
  it('mostra o heading, o select só com eventos do organizador e o estado vazio', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDaPlataforma] }),
      ),
    );

    render(<ValidacaoPage />);

    expect(
      screen.getByRole('heading', { name: 'Validação de ingressos' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhum evento do organizador ainda.'),
    ).toBeInTheDocument();
    const options = screen.getByLabelText('Evento').querySelectorAll('option');
    expect(Array.from(options).map((option) => option.textContent)).toEqual([
      'Selecione um evento',
    ]);
  });

  it('desabilita o botão Validar enquanto nenhum evento está selecionado', async () => {
    await renderComEventos();

    const validar = screen.getByRole('button', { name: 'Validar' });
    expect(validar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    expect(validar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    expect(validar).toBeEnabled();
  });

  it('valida o código manualmente com POST, corpo e veredito de assento', async () => {
    handlerDeValidacao(vereditoValido);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresso válido.')).toBeInTheDocument();
    expect(
      screen.getByText('Setor A · Fila B · Assento 12'),
    ).toBeInTheDocument();
    const requisicao = requisicoesValidacao[0];
    expect(requisicao.method).toBe('POST');
    expect(new URL(requisicao.url).pathname).toBe(
      `/api/organizer/events/${eventoDoOrganizador.id}/tickets/validate`,
    );
    expect(requisicao.body).toEqual({ code: 'TKT-001' });
  });

  it('valida pelo onCode do scanner exatamente como o envio manual', async () => {
    handlerDeValidacao(vereditoValido);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    scannerStub.handlers.onCode?.('CODE-123');

    expect(await screen.findByText('Ingresso válido.')).toBeInTheDocument();
    expect(requisicoesValidacao).toHaveLength(1);
    expect(requisicoesValidacao[0].body).toEqual({ code: 'CODE-123' });
  });

  it('mostra o veredito already_used com data e hora de São Paulo', async () => {
    handlerDeValidacao(vereditoUsado);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(
      await screen.findByText('Ingresso já utilizado.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Utilizado em 20 de Novembro, 2026 às 20:30 por Pedro Alves.',
      ),
    ).toBeInTheDocument();
  });

  it('mostra o veredito inválido sem linha de assento', async () => {
    handlerDeValidacao(vereditoInvalido);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresso inválido.')).toBeInTheDocument();
    expect(screen.queryByText(/Fila/)).not.toBeInTheDocument();
  });

  it('substitui o veredito anterior em uma nova validação', async () => {
    handlerDeValidacao(vereditoValido);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Ingresso válido.');

    handlerDeValidacao(vereditoInvalido);
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('Ingresso inválido.')).toBeInTheDocument();
    expect(screen.queryByText('Ingresso válido.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Setor A · Fila B · Assento 12'),
    ).not.toBeInTheDocument();
  });

  it('mostra mensagem quando um código chega sem evento selecionado e não envia request', async () => {
    handlerDeValidacao(vereditoValido);
    await renderComEventos();

    scannerStub.handlers.onCode?.('CODE-123');

    expect(
      await screen.findByText('Selecione um evento antes de validar.'),
    ).toBeInTheDocument();
    expect(requisicoesValidacao).toHaveLength(0);
  });

  it('mostra o estado de validação enquanto a requisição está em voo', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [eventoDoOrganizador] }),
      ),
    );
    server.use(
      http.post(
        /\/api\/organizer\/events\/[^/]+\/tickets\/validate/,
        async () => {
          await new Promise(() => undefined);
          return HttpResponse.json({});
        },
      ),
    );

    render(<ValidacaoPage />);
    await screen.findByText('Festa do Livro');
    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    scannerStub.handlers.onCode?.('CODE-123');

    expect(await screen.findByText('Validando ingresso…')).toBeInTheDocument();
  });

  it('mostra a mensagem de falha com o erro mapeado em role alert', async () => {
    handlerDeValidacao({ error: 'event_not_found' }, 404);
    await renderComEventos();

    fireEvent.change(screen.getByLabelText('Evento'), {
      target: { value: eventoDoOrganizador.id },
    });
    fireEvent.change(screen.getByLabelText('Código do ingresso'), {
      target: { value: 'TKT-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível validar o ingresso.');
    expect(alerta).toHaveTextContent('Evento não encontrado.');
  });

  it('mostra o aviso de câmera indisponível quando onCameraError dispara', async () => {
    await renderComEventos();

    scannerStub.handlers.onCameraError?.();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Não foi possível acessar a câmera. Use o código manual.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Câmera do scanner')).toBeInTheDocument();
  });
});
