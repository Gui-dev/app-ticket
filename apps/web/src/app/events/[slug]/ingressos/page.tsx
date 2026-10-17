import type { EventDetailDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EventDetailError } from '@/components/event-detail';
import { Header } from '@/components/header';
import { SeatMap } from '@/components/seat-map';
import { fetchEventBySlug } from '@/lib/events-api';

export const instant = false;

type IngressosPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function IngressosPage({ params }: IngressosPageProps) {
  const { slug } = await params;

  let event: EventDetailDto | null;
  try {
    event = await fetchEventBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <EventDetailError />
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
            href={`/events/${slug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Voltar para o evento
          </Link>
          <h1 className="font-heading text-3xl font-bold">Escolha seu lugar</h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>
        <SeatMap key={slug} eventSlug={slug} />
      </main>
    </>
  );
}
