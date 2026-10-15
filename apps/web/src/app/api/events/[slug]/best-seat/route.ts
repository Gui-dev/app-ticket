import {
  bestSeatQuerySchema,
  bestSeatResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type BestSeatContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: Request,
  context: BestSeatContext,
): Promise<Response> {
  const { slug } = await context.params;
  const sector = new URL(request.url).searchParams.get('sector') ?? '';
  const parsed = bestSeatQuerySchema.safeParse({ sector });
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/best-seat?sector=${encodeURIComponent(parsed.data.sector)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
  } catch (error) {
    console.error('Best seat upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 404) {
    try {
      const body = await upstream.json();
      return Response.json(body, { status: 404 });
    } catch (error) {
      console.error('Best seat upstream 404 body was not json:', error);
      return Response.json({ error: 'upstream_error' }, { status: 502 });
    }
  }
  if (!upstream.ok) {
    console.error(
      `Best seat upstream responded with status ${upstream.status}`,
    );
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = bestSeatResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Best seat upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
