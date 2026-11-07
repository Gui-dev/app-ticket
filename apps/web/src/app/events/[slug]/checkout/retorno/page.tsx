import Link from 'next/link';

import { Header } from '@/components/header';
import { OrderStatus } from '@/components/order-status';

export const instant = false;

type RetornoPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string | string[] }>;
};

export default async function RetornoPage({
  params,
  searchParams,
}: RetornoPageProps) {
  const { slug } = await params;
  const { order } = await searchParams;
  const orderId = typeof order === 'string' ? order : null;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/events/${slug}`}
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          ← Voltar para o evento
        </Link>
        {orderId ? (
          <OrderStatus orderId={orderId} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Não encontramos o pedido nesta página de retorno.
          </p>
        )}
      </main>
    </>
  );
}
