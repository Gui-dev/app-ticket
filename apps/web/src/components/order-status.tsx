'use client';

import { OrderConfirmation } from '@/components/order-confirmation';
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
        Carregando o pedido...
      </p>
    );
  }

  return <OrderConfirmation order={order} />;
}
