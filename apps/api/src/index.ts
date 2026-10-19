import { buildApp } from './app';
import { createDb } from './db/client';
import { loadEnvFile } from './load-env';
import { createPaymentsWorker } from './modules/payments/create-payments-worker';
import { createRedis } from './redis/client';

loadEnvFile();

const port = Number(process.env.PORT ?? 3001);

const app = buildApp();

const db = createDb();
const connection = createRedis();
connection.options.maxRetriesPerRequest = null;

const { queue, worker } = await createPaymentsWorker({ db, connection });

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`[api] listening on http://localhost:${port}`);
  })
  .catch((error) => {
    console.error('[api] failed to start', error);
    process.exit(1);
  });

async function shutdown(): Promise<void> {
  await worker.close();
  await queue.close();
  connection.disconnect();
  await app.close();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
