'use client';

import type { CategoryDto, OrganizerVenueDto } from '@ticketvibe/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createOrganizerEvent,
  fetchOrganizerVenues,
} from '@/lib/organizer-api';

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

type NovoEventoFormProps = {
  categories: CategoryDto[];
};

function NovoEventoForm({ categories }: NovoEventoFormProps) {
  const router = useRouter();
  const [venues, setVenues] = useState<OrganizerVenueDto[] | null>(null);
  const [venuesFailed, setVenuesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const created = await createOrganizerEvent({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        categorySlug: String(form.get('categorySlug') ?? ''),
        venueSlug: String(form.get('venueSlug') ?? ''),
        startsAt: new Date(String(form.get('startsAt'))).toISOString(),
      });
      router.push(`/organizador/eventos/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Novo evento</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label
          htmlFor="novo-evento-title"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Título
          <Input id="novo-evento-title" type="text" name="title" required />
        </label>
        <label
          htmlFor="novo-evento-description"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Descrição
          <Input
            id="novo-evento-description"
            type="text"
            name="description"
            required
          />
        </label>
        <div className="flex items-center justify-between gap-2 text-sm font-medium">
          <label
            htmlFor="novo-evento-category"
            className="flex flex-col gap-1.5"
          >
            Categoria
            <select
              id="novo-evento-category"
              name="categorySlug"
              required
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="" disabled>
                Selecione uma categoria
              </option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="novo-evento-venue" className="flex flex-col gap-1.5">
            Local
            <select
              id="novo-evento-venue"
              name="venueSlug"
              required
              disabled={venues === null}
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                {venuesFailed
                  ? 'Não foi possível carregar os locais.'
                  : 'Selecione um local'}
              </option>
              {venues?.map((venue) => (
                <option key={venue.slug} value={venue.slug}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label
          htmlFor="novo-evento-starts-at"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Data e hora
          <Input
            id="novo-evento-starts-at"
            type="datetime-local"
            name="startsAt"
            required
          />
        </label>
        <Button type="submit" disabled={pending}>
          Criar evento
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Faltou um espaço?{' '}
        <Link
          href="/organizador/locais"
          className="text-primary hover:underline"
        >
          Cadastrar local
        </Link>
      </p>
    </section>
  );
}

export { NovoEventoForm };
