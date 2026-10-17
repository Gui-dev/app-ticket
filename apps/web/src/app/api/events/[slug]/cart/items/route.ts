import {
  cartItemRequestSchema,
  setCartItemResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type SetCartItemContext = { params: Promise<{ slug: string }> };

export async function PUT(
  request: Request,
  context: SetCartItemContext,
): Promise<Response> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = cartItemRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/cart/items`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify(parsed.data),
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch (error) {
    console.error('Set cart item upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404) {
    try {
      const body = await upstream.json();
      return Response.json(body, { status: 404 });
    } catch (error) {
      console.error('Set cart item upstream 404 body was not json:', error);
      return Response.json({ error: 'upstream_error' }, { status: 502 });
    }
  }
  if (!upstream.ok) {
    console.error(
      `Set cart item upstream responded with status ${upstream.status}`,
    );
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = setCartItemResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Set cart item upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
