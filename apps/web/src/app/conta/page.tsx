'use client';

import {
  type OrderSummaryDto,
  orderListResponseSchema,
} from '@ticketvibe/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AccountOrders } from '@/components/account-orders';
import { Header } from '@/components/header';

const LOAD_FAILED_MESSAGE = 'Não foi possível carregar seus pedidos.';

export default function ContaPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummaryDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrders() {
      try {
        const response = await fetch('/api/orders', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401) {
          router.push('/entrar');
          return;
        }
        if (!response.ok) throw new Error('orders_request_failed');
        const payload = orderListResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setOrders(payload.orders);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    }

    void loadOrders();
    return () => controller.abort();
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          Meus pedidos
        </h1>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {LOAD_FAILED_MESSAGE}
          </p>
        ) : orders === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando seus pedidos...
          </p>
        ) : (
          <AccountOrders orders={orders} />
        )}
      </main>
    </>
  );
}
