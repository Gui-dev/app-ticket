'use client';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  type CartDto,
  cartSchema,
  createOrderResponseSchema,
  type OrderDto,
  type OrderPaymentDto,
  orderTotals,
  type PaymentMethod,
} from '@ticketvibe/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckoutSummary } from '@/components/checkout-summary';
import { OrderConfirmation } from '@/components/order-confirmation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useOrderStatus } from '@/lib/use-order-status';

export const ORDER_POLL_MS = 3_000;

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'card', label: 'Cartão' },
  { value: 'boleto', label: 'Boleto' },
];

const CART_CHANGED_MESSAGE =
  'Seu carrinho mudou. Volte para a escolha dos assentos e tente novamente.';
const PAYMENT_FAILED_MESSAGE =
  'O pagamento não foi concluído. Tente novamente em alguns instantes.';
const REQUEST_FAILED_MESSAGE =
  'Não foi possível concluir a compra. Tente novamente.';
const CONFIRM_FAILED_MESSAGE =
  'Não foi possível confirmar o pagamento. Tente novamente.';
const STRIPE_UNAVAILABLE_MESSAGE =
  'O pagamento online está indisponível neste momento.';

export interface CheckoutFlowProps {
  eventSlug: string;
  eventTitle: string;
}

function readStripePublishableKey(): string | null {
  if (typeof process === 'undefined') return null;
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      return body.error;
    }
    return null;
  } catch {
    return null;
  }
}

interface StripePaymentFieldsProps {
  eventSlug: string;
  orderId: string;
  onError: (message: string) => void;
}

function StripePaymentFields({
  eventSlug,
  orderId,
  onError,
}: StripePaymentFieldsProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  async function confirmPayment() {
    if (!stripe || !elements || confirming) return;
    setConfirming(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/events/${eventSlug}/checkout/retorno?order=${orderId}`,
      },
      redirect: 'if_required',
    });
    if (result.error) {
      onError(CONFIRM_FAILED_MESSAGE);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PaymentElement />
      <Button
        type="button"
        disabled={confirming}
        onClick={() => {
          void confirmPayment();
        }}
      >
        {confirming ? 'Confirmando...' : 'Confirmar pagamento'}
      </Button>
    </div>
  );
}

export function CheckoutFlow({ eventSlug, eventTitle }: CheckoutFlowProps) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [cart, setCart] = useState<CartDto | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionRequired, setSessionRequired] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderDto | null>(null);
  const [payment, setPayment] = useState<OrderPaymentDto | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setCartLoading(false);
      return;
    }
    const controller = new AbortController();
    async function loadCart() {
      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(eventSlug)}/cart`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('cart_request_failed');
        const payload = cartSchema.parse(await response.json());
        setCart(payload);
        setCartError(null);
      } catch {
        if (controller.signal.aborted) return;
        setCartError(
          'Não foi possível carregar seu carrinho. Tente novamente.',
        );
      } finally {
        if (!controller.signal.aborted) setCartLoading(false);
      }
    }
    void loadCart();
    return () => controller.abort();
  }, [eventSlug, userId]);

  const orderId = createdOrder?.id ?? null;
  const { order: polledOrder } = useOrderStatus(orderId, ORDER_POLL_MS);
  const order = polledOrder ?? createdOrder;

  useEffect(() => {
    if (payment?.provider !== 'stripe') return;
    const publishableKey = readStripePublishableKey();
    if (!publishableKey) {
      setStripeError(STRIPE_UNAVAILABLE_MESSAGE);
      return;
    }
    setStripePromise(loadStripe(publishableKey));
  }, [payment]);

  async function submitOrder() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventSlug)}/orders`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paymentMethod: method }),
        },
      );
      if (response.status === 401) {
        setSessionRequired(true);
        return;
      }
      if (response.status === 409) {
        setSubmitError(CART_CHANGED_MESSAGE);
        return;
      }
      if (!response.ok) {
        const code = await readErrorCode(response);
        setSubmitError(
          code === 'payment_failed'
            ? PAYMENT_FAILED_MESSAGE
            : REQUEST_FAILED_MESSAGE,
        );
        return;
      }
      const payload = createOrderResponseSchema.parse(await response.json());
      setCreatedOrder(payload.order);
      setPayment(payload.payment);
    } catch {
      setSubmitError(REQUEST_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  if (session.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando checkout...
      </p>
    );
  }

  if (!userId || sessionRequired) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground">Entre para finalizar a compra</p>
        <Button asChild variant="outline" className="self-start">
          <Link href="/entrar">Entrar</Link>
        </Button>
      </section>
    );
  }

  if (cartLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando seu carrinho...
      </p>
    );
  }

  if (cartError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {cartError}
      </p>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground">Seu carrinho está vazio.</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/events/${eventSlug}/ingressos`}>Escolher assentos</Link>
        </Button>
      </section>
    );
  }

  const totals = orderTotals(cart.items);
  const waitingPayment = order?.status === 'pending';

  return (
    <div className="flex flex-col gap-6">
      {!order && (
        <CheckoutSummary
          items={cart.items}
          subtotalCents={totals.subtotalCents}
          serviceFeeCents={totals.serviceFeeCents}
          totalCents={totals.totalCents}
        />
      )}

      {order ? (
        <OrderConfirmation order={order} />
      ) : (
        <section
          aria-label="Pagamento"
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Pagamento de {eventTitle}
          </h2>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">
              Forma de pagamento
            </legend>
            {PAYMENT_METHODS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                  className="size-4 accent-primary"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <Button
            type="button"
            disabled={submitting}
            onClick={() => {
              void submitOrder();
            }}
          >
            {submitting ? 'Processando...' : 'Pagar'}
          </Button>
        </section>
      )}

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      {waitingPayment && payment?.provider === 'fake' && (
        <section
          aria-label="Pagamento simulado"
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Pagamento simulado (sandbox)
          </h2>
          <p className="text-sm text-muted-foreground">
            Dispare o webhook do provedor com a referência{' '}
            <code className="font-mono text-xs text-foreground">
              {payment.providerRef}
            </code>{' '}
            para confirmar o pagamento.
          </p>
        </section>
      )}

      {waitingPayment && payment?.provider === 'stripe' && (
        <>
          {stripeError && (
            <p role="alert" className="text-sm text-destructive">
              {stripeError}
            </p>
          )}
          {stripePromise && payment.clientSecret && order && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret: payment.clientSecret }}
            >
              <StripePaymentFields
                eventSlug={eventSlug}
                orderId={order.id}
                onError={setSubmitError}
              />
            </Elements>
          )}
        </>
      )}
    </div>
  );
}
