'use client';

import type { OrganizerVenueDto } from '@ticketvibe/shared';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createOrganizerVenue,
  fetchOrganizerVenues,
  updateOrganizerVenue,
} from '@/lib/organizer-api';

const LOAD_FAILED_MESSAGE = 'Não foi possível carregar os locais.';
const EMPTY_MESSAGE = 'Nenhum local cadastrado ainda.';
const PENDING_MESSAGE = 'Carregando os locais...';
const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

type EditingState = {
  id: string;
  error: string | null;
  pending: boolean;
};

type VenueFieldsProps = {
  idPrefix: string;
  venue?: OrganizerVenueDto;
};

function VenueFields({ idPrefix, venue }: VenueFieldsProps) {
  return (
    <>
      <label
        htmlFor={`${idPrefix}-name`}
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Nome
        <Input
          id={`${idPrefix}-name`}
          type="text"
          name="name"
          required
          minLength={3}
          maxLength={120}
          defaultValue={venue?.name}
        />
      </label>
      <label
        htmlFor={`${idPrefix}-city`}
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Cidade
        <Input
          id={`${idPrefix}-city`}
          type="text"
          name="city"
          required
          minLength={2}
          maxLength={60}
          defaultValue={venue?.city}
        />
      </label>
      <label
        htmlFor={`${idPrefix}-state`}
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Estado
        <Input
          id={`${idPrefix}-state`}
          type="text"
          name="state"
          required
          minLength={2}
          maxLength={2}
          defaultValue={venue?.state}
        />
      </label>
    </>
  );
}

function sortVenuesByName(venues: OrganizerVenueDto[]): OrganizerVenueDto[] {
  return [...venues].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function errorFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : GENERIC_MESSAGE;
}

const ALERT_CLASS =
  'rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive';

function LocaisPage() {
  const [venues, setVenues] = useState<OrganizerVenueDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVenues() {
      try {
        const loaded = await fetchOrganizerVenues();
        if (controller.signal.aborted) return;
        setVenues(loaded);
      } catch {
        if (controller.signal.aborted) return;
        setFailed(true);
      }
    }

    void loadVenues();
    return () => controller.abort();
  }, []);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePending(true);
    setCreateError(null);
    const form = new FormData(event.currentTarget);
    try {
      const created = await createOrganizerVenue({
        name: String(form.get('name') ?? ''),
        city: String(form.get('city') ?? ''),
        state: String(form.get('state') ?? '').toUpperCase(),
      });
      setVenues((previous) => sortVenuesByName([...(previous ?? []), created]));
      setCreateOpen(false);
    } catch (cause) {
      setCreateError(errorFrom(cause));
    } finally {
      setCreatePending(false);
    }
  }

  async function handleEditSubmit(
    event: FormEvent<HTMLFormElement>,
    venue: OrganizerVenueDto,
  ) {
    event.preventDefault();
    setEditing((previous) =>
      previous && previous.id === venue.id
        ? { ...previous, error: null, pending: true }
        : previous,
    );
    const form = new FormData(event.currentTarget);
    try {
      const updated = await updateOrganizerVenue(venue.id, {
        name: String(form.get('name') ?? ''),
        city: String(form.get('city') ?? ''),
        state: String(form.get('state') ?? '').toUpperCase(),
      });
      setVenues((previous) =>
        previous
          ? sortVenuesByName(
              previous.map((item) => (item.id === updated.id ? updated : item)),
            )
          : previous,
      );
      setEditing(null);
    } catch (cause) {
      setEditing((previous) =>
        previous && previous.id === venue.id
          ? { ...previous, error: errorFrom(cause), pending: false }
          : previous,
      );
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Locais</h1>
        {venues !== null && !failed && !createOpen ? (
          <Button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            Cadastrar local
          </Button>
        ) : null}
      </div>
      {createOpen ? (
        <form
          onSubmit={handleCreateSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        >
          {createError ? (
            <p role="alert" className={ALERT_CLASS}>
              {createError}
            </p>
          ) : null}
          <VenueFields idPrefix="novo-local" />
          <Button type="submit" disabled={createPending}>
            Cadastrar local
          </Button>
        </form>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {LOAD_FAILED_MESSAGE}
        </p>
      ) : venues === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {PENDING_MESSAGE}
        </p>
      ) : venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_MESSAGE}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {venues.map((venue) => (
            <li
              key={venue.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              {editing?.id === venue.id ? (
                <form
                  onSubmit={(event) => handleEditSubmit(event, venue)}
                  className="flex flex-col gap-3"
                >
                  {editing.error ? (
                    <p role="alert" className={ALERT_CLASS}>
                      {editing.error}
                    </p>
                  ) : null}
                  <VenueFields idPrefix={`local-${venue.id}`} venue={venue} />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={editing.pending}>
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">
                      {venue.name}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {`${venue.city}/${venue.state}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({
                        id: venue.id,
                        error: null,
                        pending: false,
                      })
                    }
                  >
                    Editar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default LocaisPage;
