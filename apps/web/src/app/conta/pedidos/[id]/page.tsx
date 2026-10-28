'use client';

import {
  type EventSummaryDto,
  type OrderDto,
  orderDetailResponseSchema,
  orderResponseSchema,
} from '@ticketvibe/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Header } from '@/components/header';
import { OrderTickets } from '@/components/order-tickets';
import { formatBRL, formatDatePtBR } from '@/lib/format';

const LOADING_MESSAGE = 'Carregando o pedido...';

const STATUS_LABELS: Record<OrderDto['status'], string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pagamento confirmado',
  failed: 'Pagamento não confirmado',
  expired: 'Pedido expirado',
  refunded: 'Reembolsado',
};

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  order_not_cancellable: 'Este pedido não pode mais ser cancelado.',
  refund_window_closed: 'O período de cancelamento deste pedido já encerrou.',
  refund_not_allowed:
    'A política de cancelamento deste evento não permite reembolso.',
  refund_provider_error:
    'Não foi possível processar o reembolso agora. Tente novamente.',
};

const DEFAULT_CANCEL_ERROR_MESSAGE =
  'Não foi possível cancelar o pedido. Tente novamente.';

const PAYMENT_METHOD_LABELS: Record<OrderDto['paymentMethod'], string> = {
  card: 'Cartão',
  boleto: 'Boleto',
};

type LoadState = 'loading' | 'not_found' | 'failed';

function PedidoContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [event, setEvent] = useState<EventSummaryDto | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setEvent(null);
    setState('loading');

    async function loadOrder() {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.push('/entrar');
          return;
        }
        if (response.status === 404) {
          if (!controller.signal.aborted) setState('not_found');
          return;
        }
        if (!response.ok) throw new Error('order_request_failed');
        const payload = orderDetailResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setOrder(payload.order);
        setEvent(payload.event);
      } catch {
        if (controller.signal.aborted) return;
        setState('failed');
      }
    }

    void loadOrder();
    return () => controller.abort();
  }, [id, router]);

  async function cancelOrder() {
    setCancelPending(true);
    setCancelError(null);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(id)}/cancel`,
        { method: 'POST' },
      );
      if (response.status === 401) {
        router.push('/entrar');
        return;
      }
      if (!response.ok) {
        const payload: unknown = await response.json();
        const code =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof (payload as { error: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : null;
        setCancelError(
          (code && CANCEL_ERROR_MESSAGES[code]) ?? DEFAULT_CANCEL_ERROR_MESSAGE,
        );
        return;
      }
      const payload = orderResponseSchema.parse(await response.json());
      setOrder(payload.order);
    } catch {
      setCancelError(DEFAULT_CANCEL_ERROR_MESSAGE);
    } finally {
      setCancelPending(false);
    }
  }

  if (state === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o pedido.
      </p>
    );
  }

  if (state === 'not_found') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Pedido não encontrado.
      </p>
    );
  }

  if (order === null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {LOADING_MESSAGE}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold text-foreground">
          {event?.title ?? order.eventSlug}
        </h2>
        {event ? (
          <p className="text-sm text-muted-foreground">
            {formatDatePtBR(event.startsAt)}
          </p>
        ) : null}
      </div>
      <section
        aria-label="Resumo do pedido"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <p className="w-fit rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
          {STATUS_LABELS[order.status]}
        </p>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Pedido feito em</dt>
            <dd className="text-foreground">
              {formatDatePtBR(order.createdAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-foreground">
              {formatBRL(order.subtotalCents)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Taxa de serviço</dt>
            <dd className="text-foreground">
              {formatBRL(order.serviceFeeCents)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Pagamento</dt>
            <dd className="text-foreground">
              {PAYMENT_METHOD_LABELS[order.paymentMethod]}
            </dd>
          </div>
          {order.refundCents !== null ? (
            <p className="text-sm text-foreground">
              Reembolso de {formatBRL(order.refundCents)}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 font-semibold">
            <dt className="text-foreground">Total</dt>
            <dd className="text-foreground">{formatBRL(order.totalCents)}</dd>
          </div>
        </dl>
      </section>
      <OrderTickets order={order} />
      {cancelError ? (
        <p role="alert" className="text-sm text-destructive">
          {cancelError}
        </p>
      ) : null}
      {order.status === 'paid' ? (
        <button
          type="button"
          onClick={() => void cancelOrder()}
          disabled={cancelPending}
          className="w-fit self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar pedido
        </button>
      ) : null}
    </>
  );
}

export default function PedidoPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <Link
            href="/conta"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Voltar para meus pedidos
          </Link>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Pedido
          </h1>
        </div>
        <Suspense
          fallback={
            <p role="status" className="text-sm text-muted-foreground">
              {LOADING_MESSAGE}
            </p>
          }
        >
          <PedidoContent />
        </Suspense>
      </main>
    </>
  );
}
