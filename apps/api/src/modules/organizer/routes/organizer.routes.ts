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
    const guard = guardOrganizer(session);
    switch (guard.kind) {
      case 'not_authenticated':
        return reply.code(401).send({ error: 'not_authenticated' });
      case 'not_organizer':
        return reply.code(403).send({ error: 'not_organizer' });
      case 'ok':
        return reply.code(200).send({
          user: {
            id: session!.userId,
            email: session!.email ?? null,
            role: session!.role,
          },
        });
    }
  });
}
