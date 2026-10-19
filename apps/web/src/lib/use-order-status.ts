'use client';

import { type OrderDto, orderResponseSchema } from '@ticketvibe/shared';
import { useEffect, useRef, useState } from 'react';

export interface OrderStatusResult {
  order: OrderDto | null;
  failed: boolean;
}

export function useOrderStatus(
  orderId: string | null,
  pollMs: number,
): OrderStatusResult {
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [failed, setFailed] = useState(false);
  const orderRef = useRef<OrderDto | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const id = orderId;
    let cancelled = false;
    let inFlight = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('order_request_failed');
        const payload = orderResponseSchema.parse(await response.json());
        if (cancelled) return;
        orderRef.current = payload.order;
        setOrder(payload.order);
        setFailed(false);
        if (payload.order.status !== 'pending' && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        if (cancelled) return;
        if (!orderRef.current) setFailed(true);
      } finally {
        inFlight = false;
      }
    }

    void poll();
    interval = setInterval(() => {
      void poll();
    }, pollMs);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [orderId, pollMs]);

  return { order, failed };
}
