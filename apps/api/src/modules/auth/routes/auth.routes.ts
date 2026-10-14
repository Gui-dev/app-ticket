import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';

type AuthHandler = {
  handler: (request: Request) => Promise<Response>;
};

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthHandler,
): void {
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/auth/*',
    async handler(request, reply) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const headers = fromNodeHeaders(request.headers);
        headers.delete('content-length');
        headers.delete('host');

        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const response = await auth.handler(
          new Request(url.toString(), {
            method: request.method,
            headers,
            ...(hasBody ? { body: JSON.stringify(request.body ?? {}) } : {}),
          }),
        );

        reply.status(response.status);
        for (const [key, value] of response.headers.entries()) {
          if (key !== 'set-cookie') {
            reply.header(key, value);
          }
        }
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length > 0) {
          reply.header('set-cookie', setCookies);
        }
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        console.error('Auth route failed:', error);
        return reply.status(500).send({ error: 'auth_upstream_error' });
      }
    },
  });
}
