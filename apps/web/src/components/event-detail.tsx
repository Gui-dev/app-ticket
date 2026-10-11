import type { EventDetailDto } from '@ticketvibe/shared';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import Link from 'next/link';

import { formatBRL, formatDatePtBR } from '@/lib/format';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

type EventDetailProps = {
  event: EventDetailDto;
};

function EventDetail({ event }: EventDetailProps) {
  return (
    <article className="flex flex-col gap-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-border p-6 shadow-card sm:p-10">
        <div
          aria-hidden="true"
          className="bg-event-gradient absolute inset-0 -z-10"
        />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {event.badgeLabel ? <Badge>{event.badgeLabel}</Badge> : null}
            <Badge variant="secondary">{event.category.name}</Badge>
          </div>
          <h1 className="font-heading text-3xl font-bold sm:text-5xl">
            {event.title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {formatDatePtBR(event.startsAt)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {event.venue.name} · {event.venue.city}/{event.venue.state}
            </span>
          </p>
          <p className="max-w-3xl text-base text-muted-foreground">
            {event.description}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
            <div>
              <p className="text-xs text-muted-foreground">A partir de</p>
              <p className="text-2xl font-bold text-primary">
                {formatBRL(event.priceFromCents)}
              </p>
            </div>
            <Button asChild size="lg" className="shadow-primary">
              <Link href={`/events/${event.slug}/ingressos`}>
                <Ticket className="size-4" aria-hidden="true" />
                Escolher ingressos
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="sectors-heading"
        className="flex flex-col gap-4"
      >
        <h2
          id="sectors-heading"
          className="font-heading text-2xl font-semibold"
        >
          Setores
        </h2>
        {event.sectors.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-border">
            {event.sectors.map((sector) => (
              <li
                key={sector.slug}
                className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
              >
                <span className="font-medium text-foreground">
                  {sector.name}
                </span>
                <span className="font-bold text-primary">
                  {formatBRL(sector.priceFromCents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Setores em divulgação em breve.
          </p>
        )}
      </section>
    </article>
  );
}

function EventDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="min-h-[18rem] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-8 w-56 animate-pulse rounded-full bg-card" />
      <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

function EventDetailError() {
  return (
    <section className="flex flex-col items-start gap-4 py-16">
      <h1 className="font-heading text-2xl font-bold">
        Não foi possível carregar o evento
      </h1>
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

export { EventDetail, EventDetailError, EventDetailSkeleton };
