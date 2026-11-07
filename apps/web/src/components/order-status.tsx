'use client';

import Link from 'next/link';
import { OrderConfirmation } from '@/components/order-confirmation';
import { Button } from '@/components/ui/button';
import { useOrderStatus } from '@/lib/use-order-status';

export const RETURN_POLL_MS = 2_000;

export interface OrderStatusProps {
  orderId: string;
}

export function OrderStatus({ orderId }: OrderStatusProps) {
  const { order, failed } = useOrderStatus(orderId, RETURN_POLL_MS);

  if (!order && failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o pedido. Tente novamente.
      </p>
    );
  }

  if (!order) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Estamos conferindo a confirmação do seu pagamento...
      </p>
    );
  }

  if (order.status === 'paid') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl font-bold text-foreground">
          Compra concluída
        </h1>
        <OrderConfirmation order={order} />
        <Button asChild className="self-start">
          <Link href="/conta/pedidos">Ver meus ingressos</Link>
        </Button>
      </div>
    );
  }

  if (order.status === 'pending') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl font-bold text-foreground">
          Estamos conferindo seu pagamento
        </h1>
        <OrderConfirmation order={order} />
      </div>
    );
  }

  return <OrderConfirmation order={order} />;
}
