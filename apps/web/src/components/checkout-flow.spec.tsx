import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createContext, type ReactNode, useContext } from 'react';
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

const sessionState = vi.hoisted(() => ({
  current: {
    data: null as {
      user: {
        id: string;
        name: string;
        email: string;
        isAnonymous?: boolean;
      };
    } | null,
    isPending: false,
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => sessionState.current },
}));

const loadStripeMock = vi.hoisted(() => vi.fn(async () => null));

const confirmPaymentMock = vi.hoisted(() =>
  vi.fn(async () => ({ paymentIntent: { id: 'pi_1' } })),
);

const StripeContext = createContext<{
  confirmPayment: typeof confirmPaymentMock;
} | null>(null);

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: loadStripeMock,
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({
    stripe,
    children,
  }: {
    stripe: unknown;
    children: ReactNode;
  }) => {
    expect(stripe).toBe(loadStripeMock.mock.results[0]?.value);
    return (
      <StripeContext.Provider value={{ confirmPayment: confirmPaymentMock }}>
        {children}
      </StripeContext.Provider>
    );
  },
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => useContext(StripeContext),
  useElements: () => useContext(StripeContext),
}));

const server = setupServer();

let CheckoutFlow: typeof import('./checkout-flow').CheckoutFlow;

const EVENT_SLUG = 'o-fantasma-da-opera';

const cartItem = {
  sectorSlug: 'plateia',
  rowLabel: 'A',
  seatLabel: '6',
  ticketType: 'meia',
  priceCents: 6000,
};

function buildOrder(status: 'pending' | 'paid' | 'failed') {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    eventSlug: EVENT_SLUG,
    status,
    paymentMethod: 'card',
    subtotalCents: 6000,
    serviceFeeCents: 600,
    totalCents: 6600,
    items: [cartItem],
    createdAt: '2026-10-18T12:00:00.000Z',
    paidAt: status === 'paid' ? '2026-10-18T12:05:00.000Z' : null,
  };
}

function signIn(isAnonymous?: boolean) {
  const user: {
    id: string;
    name: string;
    email: string;
    isAnonymous?: boolean;
  } = {
    id: 'u1',
    name: 'Maria Silva',
    email: 'maria@test.dev',
  };
  if (isAnonymous !== undefined) user.isAnonymous = isAnonymous;
  sessionState.current = { data: { user }, isPending: false };
}

function mockCart(items: (typeof cartItem)[] = [cartItem]) {
  server.use(
    http.get(new RegExp(`/api/events/${EVENT_SLUG}/cart$`), () =>
      HttpResponse.json({
        eventSlug: EVENT_SLUG,
        items: items.map((item) => ({
          ...item,
          expiresAt: '2026-10-18T12:10:00.000Z',
        })),
        expiresAt: items.length > 0 ? '2026-10-18T12:10:00.000Z' : null,
        totalCents: items.reduce((sum, item) => sum + item.priceCents, 0),
      }),
    ),
  );
}

function mockCreateOrder(
  payment: {
    provider: 'stripe' | 'fake';
    providerRef: string;
    clientSecret: string | null;
  },
  status = 201,
) {
  server.use(
    http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
      HttpResponse.json({ order: buildOrder('pending'), payment }, { status }),
    ),
  );
}

function mockOrderGet(status: 'pending' | 'paid' | 'failed') {
  server.use(
    http.get(/\/api\/orders\/.+$/, () =>
      HttpResponse.json({ order: buildOrder(status) }),
    ),
  );
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ CheckoutFlow } = await import('./checkout-flow'));
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_123');
});

afterEach(() => {
  server.resetHandlers();
  sessionState.current = { data: null, isPending: false };
  loadStripeMock.mockClear();
  confirmPaymentMock.mockClear();
  vi.unstubAllEnvs();
});

afterAll(() => server.close());

describe('CheckoutFlow', () => {
  it('pede o login quando o comprador não tem sessão', async () => {
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    expect(
      await screen.findByText('Entre para finalizar a compra'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Entrar na conta' }),
    ).toHaveAttribute('href', '/entrar');
  });

  it('pede o login quando a sessão é anônima', async () => {
    signIn(true);
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    expect(
      await screen.findByText('Entre para finalizar a compra'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Entrar na conta' }),
    ).toHaveAttribute('href', '/entrar');
  });

  it('avisa que o carrinho está vazio', async () => {
    signIn();
    mockCart([]);
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    expect(
      await screen.findByText('Seu carrinho está vazio.'),
    ).toBeInTheDocument();
  });

  it('mostra o resumo com taxa e total e deixa escolher o boleto', async () => {
    signIn();
    mockCart();
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    expect(
      await screen.findByText('plateia · Fila A · Cadeira 6 · R$ 60,00'),
    ).toBeInTheDocument();
    expect(screen.getByText('Taxa de serviço')).toBeInTheDocument();
    expect(screen.getByText('R$ 6,00')).toBeInTheDocument();
    expect(screen.getByText('Total: R$ 66,00')).toBeInTheDocument();

    const boleto = screen.getByRole('radio', { name: 'Boleto' });
    expect(boleto).not.toBeChecked();
    fireEvent.click(boleto);
    expect(boleto).toBeChecked();
  });

  it('mostra o pagamento simulado sem carregar o Stripe no provedor fake', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'fake',
      providerRef: 'pi_fake_1',
      clientSecret: null,
    });
    mockOrderGet('pending');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByText(/pagamento simulado/i)).toBeInTheDocument();
    expect(screen.getByText('pi_fake_1')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it('carrega o Stripe e mostra o Payment Element no provedor stripe', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'pi_1_secret',
    });
    mockOrderGet('pending');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_123');
  });

  it('confirma o pagamento com o Stripe e volta para o retorno do checkout', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'pi_1_secret',
    });
    mockOrderGet('pending');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar pagamento' }),
    );

    await vi.waitFor(() => expect(confirmPaymentMock).toHaveBeenCalled());
    expect(confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmParams: {
          return_url: `${window.location.origin}/events/${EVENT_SLUG}/checkout/retorno?order=11111111-1111-4111-8111-111111111111`,
        },
      }),
    );
  });

  it('avisa quando o provedor stripe não entrega o segredo do pagamento', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: null,
    });
    mockOrderGet('pending');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(
      await screen.findByText(
        'Não foi possível iniciar o pagamento. Recarregue a página para tentar novamente.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
  });

  it('libera o botão quando a confirmação do Stripe falha', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'pi_1_secret',
    });
    mockOrderGet('pending');
    confirmPaymentMock.mockRejectedValueOnce(new Error('stripe_unreachable'));
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar pagamento' }),
    );

    expect(
      await screen.findByText(
        'Não foi possível confirmar o pagamento. Tente novamente.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmar pagamento' }),
    ).toBeEnabled();
  });

  it('confirma o pedido quando o pagamento é aprovado durante o polling', async () => {
    vi.useFakeTimers();
    try {
      signIn();
      mockCart();
      mockCreateOrder({
        provider: 'fake',
        providerRef: 'pi_fake_1',
        clientSecret: null,
      });
      let requests = 0;
      server.use(
        http.get(/\/api\/orders\/.+$/, () => {
          requests += 1;
          return HttpResponse.json({
            order: buildOrder(requests === 1 ? 'pending' : 'paid'),
          });
        }),
      );
      render(
        <CheckoutFlow
          eventSlug={EVENT_SLUG}
          eventTitle="O Fantasma da Ópera"
        />,
      );

      await advanceUntil(
        () => screen.queryByRole('button', { name: 'Pagar' }) !== null,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));
      await advanceUntil(
        () => screen.queryByText(/pagamento simulado/i) !== null,
      );
      expect(screen.queryByText('Pedido confirmado')).not.toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(3_000);
      await advanceUntil(
        () => screen.queryByText('Pedido confirmado') !== null,
      );

      expect(screen.getByText('Pedido confirmado')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('avisa quando não consegue atualizar o status do pagamento', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'fake',
      providerRef: 'pi_fake_1',
      clientSecret: null,
    });
    server.use(http.get(/\/api\/orders\/.+$/, () => HttpResponse.error()));
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(
      await screen.findByText(
        'Não foi possível atualizar o status do pagamento. Tente novamente em alguns instantes.',
      ),
    ).toBeInTheDocument();
  });

  it('pede o login de novo quando a sessão expirou na hora de pagar', async () => {
    signIn();
    mockCart();
    server.use(
      http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(
      await screen.findByText('Entre para finalizar a compra'),
    ).toBeInTheDocument();
  });

  it('avisa que o carrinho mudou quando o assento não está mais disponível', async () => {
    signIn();
    mockCart();
    server.use(
      http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
        HttpResponse.json({ error: 'seat_unavailable' }, { status: 409 }),
      ),
    );
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seu carrinho mudou. Volte para a escolha dos assentos e tente novamente.',
    );
  });

  it('avisa que o pagamento falhou quando o provedor recusa a cobrança', async () => {
    signIn();
    mockCart();
    server.use(
      http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
        HttpResponse.json({ error: 'payment_failed' }, { status: 502 }),
      ),
    );
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O pagamento não foi concluído. Tente novamente em alguns instantes.',
    );
  });

  it('pede para tentar de novo quando a requisição falha', async () => {
    signIn();
    mockCart();
    server.use(
      http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
        HttpResponse.error(),
      ),
    );
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a compra. Tente novamente.',
    );
  });
});

async function advanceUntil(check: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await vi.advanceTimersByTimeAsync(0);
    if (check()) return;
  }
  throw new Error('A condição esperada não foi atingida.');
}
