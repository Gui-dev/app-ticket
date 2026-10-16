import { seatmapResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type SeatmapContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: Request,
  context: SeatmapContext,
): Promise<Response> {
  const { slug } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/seatmap`,
      {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (error) {
    console.error('Seatmap upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 404) {
    return Response.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!upstream.ok) {
    console.error(`Seatmap upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = seatmapResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Seatmap upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
