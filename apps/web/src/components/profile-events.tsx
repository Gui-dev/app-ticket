import type { EventDto } from '@ticketvibe/shared';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { toEventCardProps } from '@/lib/event-mapper';
import { EventCard } from './event-card';

export type ProfileEventsProps = {
  name: string;
  cityState: string | null;
  events: EventDto[];
};

function ProfileEvents({ name, cityState, events }: ProfileEventsProps) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{name}</h1>
        {cityState ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {cityState}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {events.length === 1
            ? '1 evento encontrado'
            : `${events.length} eventos encontrados`}
        </p>
      </header>
      {events.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} {...toEventCardProps(event)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum evento no momento.
        </p>
      )}
    </section>
  );
}

function ProfileEventsError({ title }: { title: string }) {
  return (
    <section className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Tente novamente em instantes.</p>
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a home
      </Link>
    </section>
  );
}

function ProfileEventsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="h-10 w-64 animate-pulse rounded-full bg-card" />
      <div className="h-4 w-40 animate-pulse rounded-full bg-card" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}

export { ProfileEvents, ProfileEventsError, ProfileEventsSkeleton };
