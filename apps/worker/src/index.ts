import { Queue, Worker } from 'bullmq';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || '6379'),
};

const queue = new Queue('heartbeat', { connection });

const worker = new Worker(
  'heartbeat',
  async (job) => {
    console.log(`[worker] job processed: ${job.id}`);
  },
  { connection },
);

queue
  .add('tick', {}, { attempts: 1 })
  .then(() => {
    console.log('[worker] listening for heartbeat jobs');
  })
  .catch((error) => {
    console.error('[worker] failed to enqueue', error);
    process.exit(1);
  });

async function shutdown() {
  await worker.close();
  await queue.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
