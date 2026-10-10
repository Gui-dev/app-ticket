import { Suspense } from 'react';

import { Header } from '@/components/header';
import { CategoryChips } from '@/components/home/category-chips';
import { EventsSection } from '@/components/home/events-section';
import { HeroCard } from '@/components/home/hero-card';
import { SearchResults } from '@/components/home/search-results';
import { toEventCardProps, toHeroCardProps } from '@/lib/event-mapper';
import { fetchCategories, fetchEvents } from '@/lib/events-api';
import {
  hasActiveFilters,
  parseSearchFilters,
  type RawSearchParams,
} from '@/lib/search-params';

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-12" aria-hidden>
      <div className="min-h-[26rem] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-10 w-full animate-pulse rounded-full bg-card" />
      <div className="h-[26rem] w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

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
        <Suspense fallback={<PageSkeleton />}>
          <HomeContent searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
