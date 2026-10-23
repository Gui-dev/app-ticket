import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import { guardOrganizer } from '../../auth/role-guard.js';

interface OrganizerRoutesDeps {
  getSession: GetSessionFn;
}

export function registerOrganizerRoutes(
  app: FastifyInstance,
  deps: OrganizerRoutesDeps,
): void {
  app.get('/organizer/session', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }
    const guard = guardOrganizer(session);
    if (guard.kind !== 'ok') {
      return reply.code(403).send({ error: 'not_organizer' });
    }
    return reply.code(200).send({
      user: {
        id: session.userId,
        email: session.email ?? null,
        role: session.role,
      },
    });
  });
}
