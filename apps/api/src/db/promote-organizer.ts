import { pathToFileURL } from 'node:url';

import { eq } from 'drizzle-orm';

import { loadEnvFile } from '../load-env.js';
import { createDb, type Db } from './client.js';
import { user } from './schema.js';

export async function promoteOrganizerByEmail(
  db: Db,
  email: string,
): Promise<{ kind: 'promoted'; userId: string } | { kind: 'not_found' }> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!row) {
    return { kind: 'not_found' };
  }

  await db.update(user).set({ role: 'organizer' }).where(eq(user.email, email));

  return { kind: 'promoted', userId: row.id };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  loadEnvFile();
  const db = createDb();
  const email = process.argv[2] ?? '';

  try {
    const result = await promoteOrganizerByEmail(db, email);
    if (result.kind === 'not_found') {
      console.error(`Organizador não encontrado: ${email}`);
      process.exitCode = 1;
    } else {
      console.log(`Usuário ${email} agora é organizer`);
    }
  } finally {
    await db.$client.end();
  }
}
