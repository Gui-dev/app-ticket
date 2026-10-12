import { Suspense } from 'react';

import { Header } from '@/components/header';
import { CategoryChips } from '@/components/home/category-chips';
import { EventsSection } from '@/components/home/events-section';
import { HeroCard } from '@/components/home/hero-card';
import { PageSkeleton } from '@/components/home/page-skeleton';
import { SearchResults } from '@/components/home/search-results';
import { ResultsRegion } from '@/components/search-transition';
import { toEventCardProps, toHeroCardProps } from '@/lib/event-mapper';
import { fetchCategories, fetchEvents } from '@/lib/events-api';
import {
  hasActiveFilters,
  parseSearchFilters,
  type RawSearchParams,
} from '@/lib/search-params';

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseSearchFilters(await searchParams);

  if (hasActiveFilters(filters)) {
    const [result, categories] = await Promise.all([
      fetchEvents(filters),
      fetchCategories(),
    ]);
    return (
      <SearchResults
        filters={filters}
        categories={categories.ok ? categories.categories : []}
        result={result}
      />
    );
  }

  const [featured, hot, categories] = await Promise.all([
    fetchEvents({ view: 'featured' }),
    fetchEvents({ view: 'hot' }),
    fetchCategories(),
  ]);
  const hero = featured.ok ? featured.events[0] : undefined;

  return (
    <div className="flex flex-col gap-12">
      {hero ? (
        <HeroCard {...toHeroCardProps(hero)} />
      ) : (
        <h1 className="sr-only">TicketVibe</h1>
      )}
      <CategoryChips
        categories={categories.ok ? categories.categories : []}
        filters={filters}
      />
      <EventsSection
        cards={hot.ok ? hot.events.map(toEventCardProps) : []}
        error={!hot.ok}
      />
    </div>
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <ResultsRegion>
          <Suspense fallback={<PageSkeleton />}>
            <HomeContent searchParams={searchParams} />
          </Suspense>
        </ResultsRegion>
      </main>
    </>
  );
}
