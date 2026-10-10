import { Suspense } from 'react';

import { Header } from '@/components/header';
import { EventsSection } from '@/components/home/events-section';
import { HeroCard } from '@/components/home/hero-card';
import { toEventCardProps, toHeroCardProps } from '@/lib/event-mapper';
import { fetchEvents } from '@/lib/events-api';

function HeroSkeleton() {
  return (
    <div
      aria-hidden
      className="min-h-[26rem] animate-pulse rounded-2xl border border-border bg-card"
    />
  );
}

function HighlightsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-9 w-72 animate-pulse rounded bg-card" />
          <div className="h-4 w-64 animate-pulse rounded bg-card" />
        </div>
      </div>
      <div className="flex gap-6 overflow-x-auto pb-2 [scrollbar-width:none]">
        <div className="h-[26rem] w-80 shrink-0 animate-pulse rounded-xl border border-border bg-card shadow-card" />
        <div className="h-[26rem] w-80 shrink-0 animate-pulse rounded-xl border border-border bg-card shadow-card" />
        <div className="h-[26rem] w-80 shrink-0 animate-pulse rounded-xl border border-border bg-card shadow-card" />
      </div>
    </div>
  );
}

async function FeaturedSection() {
  const [featured] = await fetchEvents('featured');
  if (!featured) return <h1 className="sr-only">TicketVibe</h1>;
  return <HeroCard {...toHeroCardProps(featured)} />;
}

async function HighlightsSection() {
  const events = await fetchEvents('hot');
  return <EventsSection cards={events.map(toEventCardProps)} />;
}

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<HeroSkeleton />}>
          <FeaturedSection />
        </Suspense>
        <Suspense fallback={<HighlightsSkeleton />}>
          <HighlightsSection />
        </Suspense>
      </main>
    </>
  );
}
