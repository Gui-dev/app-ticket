import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';

import type { AuthInstance } from './auth.js';

export interface SessionUser {
  userId: string;
}

export type GetSessionFn = (
  headers: IncomingHttpHeaders,
) => Promise<SessionUser | null>;

export function createGetSession(auth: AuthInstance): GetSessionFn {
  return async (headers) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) return null;
    return { userId: session.user.id };
  };
}
