import {
  anonymousClient,
  inferAdditionalFields,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: { role: { type: 'string', required: false, input: false } },
    }),
    anonymousClient(),
  ],
});

let pendingAnonymousSignIn: Promise<unknown> | null = null;

export function ensureAnonymousSession(): Promise<unknown> {
  if (!pendingAnonymousSignIn) {
    pendingAnonymousSignIn = authClient.signIn.anonymous().finally(() => {
      pendingAnonymousSignIn = null;
    });
  }
  return pendingAnonymousSignIn;
}
