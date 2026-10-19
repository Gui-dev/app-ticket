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

const { loadStripeMock, confirmPaymentMock, stripeContext, stripeProps } =
  vi.hoisted(() => {
    const instance = { id: 'stripe-instance' };
    const confirmPayment = vi.fn(async () => ({
      paymentIntent: { id: 'pi_1' },
    }));
    return {
      loadStripeMock: vi.fn(async () => instance),
      confirmPaymentMock: confirmPayment,
      stripeContext: {
        current: { confirmPayment } as { confirmPayment: unknown } | null,
      },
      stripeProps: [] as Promise<unknown>[],
    };
  });

const StripeContext = createContext<unknown>(null);

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
    expect(stripe).toBeInstanceOf(Promise);
    stripeProps.push(stripe as Promise<unknown>);
    return (
      <StripeContext.Provider value={stripeContext.current}>
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

function buildOrder(
  status: 'pending' | 'paid' | 'failed',
  paymentMethod: 'card' | 'boleto' = 'card',
) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    eventSlug: EVENT_SLUG,
    status,
    paymentMethod,
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
  options: {
    status?: number;
    paymentMethod?: 'card' | 'boleto';
  } = {},
) {
  const { status = 201, paymentMethod = 'card' } = options;
  server.use(
    http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
      HttpResponse.json(
        { order: buildOrder('pending', paymentMethod), payment },
        { status },
      ),
    ),
  );
}

function mockOrderGet(
  status: 'pending' | 'paid' | 'failed',
  paymentMethod: 'card' | 'boleto' = 'card',
) {
  server.use(
    http.get(/\/api\/orders\/.+$/, () =>
      HttpResponse.json({ order: buildOrder(status, paymentMethod) }),
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
  stripeContext.current = { confirmPayment: confirmPaymentMock };
  stripeProps.length = 0;
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
    expect(await stripeProps[0]).toBe(
      await loadStripeMock.mock.results[0]?.value,
    );
  });

  it('mostra o Payment Element também quando o comprador escolhe boleto', async () => {
    signIn();
    mockCart();
    mockCreateOrder(
      {
        provider: 'stripe',
        providerRef: 'pi_1',
        clientSecret: 'pi_1_secret',
      },
      { paymentMethod: 'boleto' },
    );
    mockOrderGet('pending', 'boleto');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: 'Boleto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(
      screen.getByText('Este pedido já foi criado com Boleto.'),
    ).toBeInTheDocument();
  });

  it('mostra o método real do pedido quando a escolha do comprador foi ignorada', async () => {
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

    fireEvent.click(await screen.findByRole('radio', { name: 'Boleto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(
      await screen.findByText('Este pedido já foi criado com Cartão.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cartão' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Boleto' })).toBeDisabled();
  });

  it('desabilita a confirmação enquanto o Stripe não está pronto', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'pi_1_secret',
    });
    mockOrderGet('pending');
    stripeContext.current = null;
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    const button = await screen.findByRole('button', {
      name: 'Carregando o formulário de pagamento…',
    });
    expect(button).toBeDisabled();
    expect(confirmPaymentMock).not.toHaveBeenCalled();
  });

  it('avisa quando o Stripe.js não pode ser carregado', async () => {
    signIn();
    mockCart();
    mockCreateOrder({
      provider: 'stripe',
      providerRef: 'pi_1',
      clientSecret: 'pi_1_secret',
    });
    mockOrderGet('pending');
    loadStripeMock.mockRejectedValueOnce(new Error('stripe_js_blocked'));
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(
      await screen.findByText(
        'O pagamento online está indisponível neste momento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
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
        elements: expect.anything(),
        confirmParams: {
          return_url: `${window.location.origin}/events/${EVENT_SLUG}/checkout/retorno?order=11111111-1111-4111-8111-111111111111`,
        },
        redirect: 'if_required',
      }),
    );
  });

  it('manda o comprador para o voucher do boleto ao confirmar o boleto', async () => {
    signIn();
    mockCart();
    mockCreateOrder(
      {
        provider: 'stripe',
        providerRef: 'pi_1',
        clientSecret: 'pi_1_secret',
      },
      { paymentMethod: 'boleto' },
    );
    mockOrderGet('pending', 'boleto');
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('radio', { name: 'Boleto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar pagamento' }),
    );

    await vi.waitFor(() => expect(confirmPaymentMock).toHaveBeenCalled());
    expect(confirmPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        elements: expect.anything(),
        confirmParams: {
          return_url: `${window.location.origin}/events/${EVENT_SLUG}/checkout/retorno?order=11111111-1111-4111-8111-111111111111`,
        },
        redirect: 'always',
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

  it('limpa o erro de uma confirmação que falhou quando a próxima funciona', async () => {
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar pagamento' }),
    );
    await vi.waitFor(() => expect(confirmPaymentMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(
        screen.queryByText(
          'Não foi possível confirmar o pagamento. Tente novamente.',
        ),
      ).not.toBeInTheDocument(),
    );
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

  it('avisa que já existe um pagamento em andamento e libera o botão para tentar de novo', async () => {
    signIn();
    mockCart();
    server.use(
      http.post(new RegExp(`/api/events/${EVENT_SLUG}/orders$`), () =>
        HttpResponse.json({ error: 'order_in_progress' }, { status: 503 }),
      ),
    );
    render(
      <CheckoutFlow eventSlug={EVENT_SLUG} eventTitle="O Fantasma da Ópera" />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um pagamento em andamento para este pedido. Tente novamente em instantes.',
    );
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeEnabled();
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
