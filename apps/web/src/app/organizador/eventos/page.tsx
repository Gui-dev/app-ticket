'use client';

import type { OrganizerEventDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDatePtBR } from '@/lib/format';
import { fetchOrganizerEvents } from '@/lib/organizer-api';

const LOAD_FAILED_MESSAGE = 'Não foi possível carregar seus eventos.';
const EMPTY_MESSAGE = 'Nenhum evento cadastrado ainda.';

function EventosPage() {
  const [events, setEvents] = useState<OrganizerEventDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const loaded = await fetchOrganizerEvents();
        if (controller.signal.aborted) return;
        setEvents(loaded);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          Meus eventos
        </h1>
        {events !== null && !failed ? (
          <Button asChild>
            <Link href="/organizador/eventos/novo">Criar evento</Link>
          </Button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {LOAD_FAILED_MESSAGE}
        </p>
      ) : events === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando seus eventos...
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_MESSAGE}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                {event.platform ? (
                  <span className="text-sm font-semibold text-foreground">
                    {event.title}
                  </span>
                ) : (
                  <Link
                    href={`/organizador/eventos/${event.id}`}
                    className="text-sm font-semibold text-foreground hover:underline"
                  >
                    {event.title}
                  </Link>
                )}
                {event.platform ? (
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                    Da plataforma
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {`${formatDatePtBR(event.startsAt)} · ${event.venue.name} · ${
                  event.venue.city
                }/${event.venue.state}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default EventosPage;
