import {
  createOrderRequestSchema,
  createOrderResponseSchema,
} from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type CreateOrderContext = { params: Promise<{ slug: string }> };

function isUpstreamError(body: unknown): body is { error: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string' &&
    body.error.length > 0
  );
}

export async function POST(
  request: Request,
  context: CreateOrderContext,
): Promise<Response> {
  const { slug } = await context.params;

  const parsed = createOrderRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/orders`,
      {
        method: 'POST',
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
    console.error('Create order upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (!upstream.ok) {
    const failure = await upstream.json().catch(() => null);
    if (isUpstreamError(failure)) {
      return Response.json(failure, { status: upstream.status });
    }
    console.error(
      `Create order upstream responded with status ${upstream.status}`,
    );
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = createOrderResponseSchema.parse(await upstream.json());
    return Response.json(payload, { status: 201 });
  } catch (error) {
    console.error('Create order upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
