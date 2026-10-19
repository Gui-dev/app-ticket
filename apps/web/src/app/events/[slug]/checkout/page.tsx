import type { EventDetailDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CheckoutFlow } from '@/components/checkout-flow';
import { Header } from '@/components/header';
import { fetchEventBySlug } from '@/lib/events-api';

export const instant = false;

type CheckoutPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { slug } = await params;

  let event: EventDetailDto | null;
  try {
    event = await fetchEventBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar o evento.
          </p>
        </main>
      </>
    );
  }

  if (!event) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <Link
            href={`/events/${slug}/ingressos`}
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Voltar para os assentos
          </Link>
          <h1 className="font-heading text-3xl font-bold">Finalizar compra</h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>
        <CheckoutFlow eventSlug={slug} eventTitle={event.title} />
      </main>
    </>
  );
}
