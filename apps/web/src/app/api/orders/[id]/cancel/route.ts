import { orderResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type OrderContext = { params: Promise<{ id: string }> };

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
  context: OrderContext,
): Promise<Response> {
  const { id } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/orders/${encodeURIComponent(id)}/cancel`,
      {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch (error) {
    console.error('Order cancel upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (!upstream.ok) {
    const failure = await upstream.json().catch(() => null);
    if (isUpstreamError(failure)) {
      return Response.json(failure, { status: upstream.status });
    }
    console.error(
      `Order cancel upstream responded with status ${upstream.status}`,
    );
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = orderResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Order cancel upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
