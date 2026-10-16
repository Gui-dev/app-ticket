import { holdRequestSchema, holdResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

type HoldContext = { params: Promise<{ slug: string }> };

export async function POST(
  request: Request,
  context: HoldContext,
): Promise<Response> {
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = holdRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/${encodeURIComponent(slug)}/holds`,
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
    console.error('Hold upstream request failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (upstream.status === 401) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (upstream.status === 404 || upstream.status === 409) {
    try {
      const body = await upstream.json();
      return Response.json(body, { status: upstream.status });
    } catch (error) {
      console.error('Hold upstream error body was not json:', error);
      return Response.json({ error: 'upstream_error' }, { status: 502 });
    }
  }
  if (!upstream.ok) {
    console.error(`Hold upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = holdResponseSchema.parse(await upstream.json());
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    console.error('Hold upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
