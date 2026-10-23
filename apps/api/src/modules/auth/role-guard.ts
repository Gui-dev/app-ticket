import type { SessionUser } from './get-session.js';

export type OrganizerGuardResult =
  | { kind: 'ok' }
  | { kind: 'not_authenticated' }
  | { kind: 'not_organizer' };

export function guardOrganizer(
  session: SessionUser | null,
): OrganizerGuardResult {
  if (!session) {
    return { kind: 'not_authenticated' };
  }
  if (session.role !== 'organizer') {
    return { kind: 'not_organizer' };
  }
  return { kind: 'ok' };
}
