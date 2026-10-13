import 'server-only';

import {
  type ArtistDetailDto,
  artistDetailResponseSchema,
  type VenueDetailDto,
  venueDetailResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export type { ArtistDetailDto, VenueDetailDto };

export async function fetchArtistBySlug(
  slug: string,
): Promise<ArtistDetailDto | null> {
  try {
    const response = await fetch(
      `${API_URL}/artists/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = artistDetailResponseSchema.parse(await response.json());
    return payload.artist;
  } catch (error) {
    console.error('Failed to fetch artist:', error);
    throw error;
  }
}

export async function fetchVenueBySlug(
  slug: string,
): Promise<VenueDetailDto | null> {
  try {
    const response = await fetch(
      `${API_URL}/venues/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    const payload = venueDetailResponseSchema.parse(await response.json());
    return payload.venue;
  } catch (error) {
    console.error('Failed to fetch venue:', error);
    throw error;
  }
}
