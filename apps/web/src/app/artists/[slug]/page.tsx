import type { ArtistDetailDto } from '@ticketvibe/shared';
import { notFound } from 'next/navigation';

import { Header } from '@/components/header';
import { ProfileEvents, ProfileEventsError } from '@/components/profile-events';
import { fetchArtistBySlug } from '@/lib/profiles-api';

export const instant = false;

type ArtistPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;

  let artist: ArtistDetailDto | null;
  try {
    artist = await fetchArtistBySlug(slug);
  } catch {
    return (
      <>
        <Header />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <ProfileEventsError title="Não foi possível carregar o artista" />
        </main>
      </>
    );
  }

  if (!artist) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <ProfileEvents
          name={artist.name}
          cityState={null}
          events={artist.events}
        />
      </main>
    </>
  );
}
