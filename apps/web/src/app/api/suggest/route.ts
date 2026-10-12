import { suggestQuerySchema, suggestResponseSchema } from '@ticketvibe/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(request: Request): Promise<Response> {
  const parsed = suggestQuerySchema.safeParse({
    q: new URL(request.url).searchParams.get('q') ?? '',
  });
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/events/suggest?q=${encodeURIComponent(parsed.data.q)}`,
      { cache: 'no-store' },
    );
  } catch {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = suggestResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch {
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
