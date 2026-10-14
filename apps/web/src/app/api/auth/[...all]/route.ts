const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function proxy(request: Request, all: string[]): Promise<Response> {
  const url = new URL(request.url);
  const target = `${API_URL}/api/auth/${all.join('/')}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
      ...(hasBody ? { body: await request.text() } : {}),
    });
  } catch (error) {
    console.error('Auth proxy upstream failed:', error);
    return Response.json({ error: 'upstream_error' }, { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-length');
  const setCookies = upstream.headers.getSetCookie();
  responseHeaders.delete('set-cookie');
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', cookie);
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  return response;
}

type AuthProxyContext = { params: Promise<{ all: string[] }> };

async function handle(
  request: Request,
  context: AuthProxyContext,
): Promise<Response> {
  const { all } = await context.params;
  return proxy(request, all);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
