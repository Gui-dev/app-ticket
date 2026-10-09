import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

const { Pool } = pg;

export const DEFAULT_DATABASE_URL =
  'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe';

export const TEST_DATABASE_URL =
  'postgres://ticketvibe:ticketvibe@127.0.0.1:5432/ticketvibe_test';

export function createDb(
  url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
) {
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;
