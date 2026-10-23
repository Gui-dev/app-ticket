'use client';

import type {
  CategoryDto,
  OrganizerEventDetailDto,
  OrganizerVenueDto,
} from '@ticketvibe/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { OrganizerSectorEditor } from '@/components/organizer-sector-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/format';
import {
  fetchOrganizerEvent,
  fetchOrganizerVenues,
  updateOrganizerEvent,
} from '@/lib/organizer-api';

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

type LoadState = 'loading' | 'failed' | 'loaded';

type EventoEditorProps = {
  eventId: string;
  categories: CategoryDto[];
};

function EventoEditor({ eventId, categories }: EventoEditorProps) {
  const [event, setEvent] = useState<OrganizerEventDetailDto | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [venues, setVenues] = useState<OrganizerVenueDto[] | null>(null);
  const [venuesFailed, setVenuesFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvent() {
      try {
        const detail = await fetchOrganizerEvent(eventId);
        if (controller.signal.aborted) return;
        setEvent(detail);
        setLoadState('loaded');
      } catch (cause) {
        if (controller.signal.aborted) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar o evento.',
        );
        setLoadState('failed');
      }
    }

    void loadEvent();
    return () => controller.abort();
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVenues() {
      try {
        const loaded = await fetchOrganizerVenues();
        if (controller.signal.aborted) return;
        setVenues(loaded);
      } catch {
        if (controller.signal.aborted) return;
        setVenuesFailed(true);
      }
    }

    void loadVenues();
    return () => controller.abort();
  }, []);

  const recarregarEvento = useCallback(async () => {
    try {
      const detail = await fetchOrganizerEvent(eventId);
      setEvent(detail);
      setLoadState('loaded');
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o evento.',
      );
      setLoadState('failed');
    }
  }, [eventId]);

  async function salvarAlteracoes(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setFormError(null);
    const form = new FormData(formEvent.currentTarget);
    try {
      await updateOrganizerEvent(eventId, {
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        categorySlug: String(form.get('categorySlug') ?? ''),
        venueSlug: String(form.get('venueSlug') ?? ''),
        startsAt: fromDateTimeLocalValue(String(form.get('startsAt') ?? '')),
      });
      await recarregarEvento();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">
        Editar evento
      </h1>
      {loadState === 'failed' && event === null ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError ?? GENERIC_MESSAGE}
        </p>
      ) : event === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando o evento...
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {`URL é fixada no primeiro cadastro: /events/${event.slug}`}
          </p>
          {formError ? (
            <p
              role="alert"
              className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}
          <form
            onSubmit={(formEvent) => void salvarAlteracoes(formEvent)}
            className="flex w-full max-w-sm flex-col gap-4"
          >
            <label
              htmlFor="editar-evento-title"
              className="flex flex-col gap-1.5 text-sm font-medium"
            >
              Título
              <Input
                id="editar-evento-title"
                type="text"
                name="title"
                required
                defaultValue={event.title}
              />
            </label>
            <label
              htmlFor="editar-evento-description"
              className="flex flex-col gap-1.5 text-sm font-medium"
            >
              Descrição
              <Input
                id="editar-evento-description"
                type="text"
                name="description"
                required
                defaultValue={event.description}
              />
            </label>
            <div className="flex items-center justify-between gap-2 text-sm font-medium">
              <label
                htmlFor="editar-evento-category"
                className="flex flex-col gap-1.5"
              >
                Categoria
                <select
                  id="editar-evento-category"
                  name="categorySlug"
                  required
                  defaultValue={event.category.slug}
                  className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                >
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                htmlFor="editar-evento-venue"
                className="flex flex-col gap-1.5"
              >
                Local
                <select
                  id="editar-evento-venue"
                  name="venueSlug"
                  required
                  defaultValue={event.venue.slug}
                  disabled={venues === null}
                  className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {venues === null ? (
                    <option value="" disabled>
                      {venuesFailed
                        ? 'Não foi possível carregar os locais.'
                        : 'Selecione um local'}
                    </option>
                  ) : null}
                  {venues?.map((venue) => (
                    <option key={venue.slug} value={venue.slug}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label
              htmlFor="editar-evento-starts-at"
              className="flex flex-col gap-1.5 text-sm font-medium"
            >
              Data e hora
              <Input
                id="editar-evento-starts-at"
                type="datetime-local"
                name="startsAt"
                required
                defaultValue={toDateTimeLocalValue(event.startsAt)}
              />
            </label>
            <Button type="submit" disabled={pending}>
              Salvar alterações
            </Button>
          </form>
          <OrganizerSectorEditor
            event={event}
            onChanged={() => void recarregarEvento()}
          />
        </>
      )}
    </>
  );
}

export { EventoEditor };
