import type { VenueDetailDto } from '@ticketvibe/shared';
import { notFound } from 'next/navigation';

import { Header } from '@/components/header';
import { ProfileEvents, ProfileEventsError } from '@/components/profile-events';
import { fetchVenueBySlug } from '@/lib/profiles-api';

export const instant = false;

type VenuePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function VenuePage({ params }: VenuePageProps) {
  const { slug } = await params;

  let venue: VenueDetailDto | null;
  try {
    venue = await fetchVenueBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <ProfileEventsError title="Não foi possível carregar o local" />
        </main>
      </>
    );
  }

  if (!venue) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <ProfileEvents
          name={venue.name}
          cityState={`${venue.city}/${venue.state}`}
          events={venue.events}
        />
      </main>
    </>
  );
}
