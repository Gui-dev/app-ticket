import { cartSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type CartContext = { params: Promise<{ slug: string }> };

export async function GET(
  request: Request,
  context: CartContext,
): Promise<Response> {
  const { slug } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/cart`,
      {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (error) {
    console.error('Cart upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404) {
    return Response.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!upstream.ok) {
    console.error(`Cart upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = cartSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Cart upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
