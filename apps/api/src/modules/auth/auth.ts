import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { seats } from '../../db/schema.js';
import type { SendEmailFn } from './email.js';

export type { SendEmailInput } from './email.js';

export const DEV_GOOGLE_CLIENT_ID = 'ticketvibe-dev-client';
export const DEV_GOOGLE_CLIENT_SECRET = 'ticketvibe-dev-secret';

const DEFAULT_WEB_URL = 'http://localhost:3000';

function webUrl(): string {
  return process.env.BETTER_AUTH_URL ?? DEFAULT_WEB_URL;
}

export function createAuth(db: Db, deps: { sendEmail: SendEmailFn }) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    baseURL: webUrl(),
    trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    advanced: { disableOriginCheck: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? DEV_GOOGLE_CLIENT_ID,
        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET ?? DEV_GOOGLE_CLIENT_SECRET,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, token }) => {
        const url = `${webUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
        await deps.sendEmail({
          to: user.email,
          subject: 'Recupere sua senha do TICKETVIBE',
          text: `Olá ${user.name}, redefina sua senha acessando: ${url}`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await deps.sendEmail({
          to: user.email,
          subject: 'Confirme seu e-mail do TICKETVIBE',
          text: `Olá ${user.name}, confirme seu e-mail acessando: ${url}`,
        });
      },
    },
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await db
            .update(seats)
            .set({ holdUserId: newUser.user.id })
            .where(eq(seats.holdUserId, anonymousUser.user.id));
        },
      }),
    ],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
