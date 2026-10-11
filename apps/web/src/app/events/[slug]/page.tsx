import type { EventDetailDto } from '@ticketvibe/shared';
import { notFound } from 'next/navigation';

import { EventDetail, EventDetailError } from '@/components/event-detail';
import { Header } from '@/components/header';
import { fetchEventBySlug } from '@/lib/events-api';

export const instant = false;

type EventPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EventPage({ params }: EventPageProps) {
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <EventDetail event={event} />
      </main>
    </>
  );
}
