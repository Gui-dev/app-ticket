import { createDb } from './client.js';
import { seedFixtures } from './seed-fixtures.js';

const db = createDb();

try {
  await seedFixtures(db);
  console.log('Seed completed: 7 categories, 5 venues, 12 events.');
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
