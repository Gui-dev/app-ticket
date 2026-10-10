import type { CategoryDto, SearchFilters } from '@ticketvibe/shared';
import Link from 'next/link';

import { EventCard } from '@/components/event-card';
import { CategoryChips } from '@/components/home/category-chips';
import { toEventCardProps } from '@/lib/event-mapper';
import type { FetchEventsResult } from '@/lib/events-api';

type SearchResultsProps = {
  filters: SearchFilters;
  categories: CategoryDto[];
  result: FetchEventsResult;
};

export function SearchResults({
  filters,
  categories,
  result,
}: SearchResultsProps) {
  const count = result.ok ? result.events.length : 0;

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-6">
      <h1 className="sr-only">TicketVibe</h1>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="results-heading" className="font-heading text-3xl font-bold">
            Resultados da busca
          </h2>
          <p className="mt-2 text-muted-foreground" aria-live="polite">
            {result.ok
              ? `${count} ${count === 1 ? 'evento encontrado' : 'eventos encontrados'}`
              : 'Vitrine de eventos'}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          Limpar filtros
        </Link>
      </div>
      <CategoryChips categories={categories} filters={filters} />
      {!result.ok ? (
        <p role="alert" className="text-destructive">
          Não foi possível carregar os eventos. Tente novamente.
        </p>
      ) : result.events.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {result.events.map((event) => (
            <EventCard key={event.id} {...toEventCardProps(event)} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Nenhum evento encontrado. Ajuste a busca ou os filtros.
        </p>
      )}
    </section>
  );
}
