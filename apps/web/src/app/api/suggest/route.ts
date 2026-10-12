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
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
  } catch (error) {
    console.error('Failed to fetch suggest results:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  if (!upstream.ok) {
    console.error(`Suggest upstream responded with status ${upstream.status}`);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  try {
    const payload = suggestResponseSchema.parse(await upstream.json());
    return Response.json(payload);
  } catch (error) {
    console.error('Suggest upstream payload broke the contract:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }
}
