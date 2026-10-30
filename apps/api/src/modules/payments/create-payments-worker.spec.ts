import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../db/client.js';
import type { RedisClient } from '../../redis/client.js';
import { createPaymentsWorker } from './create-payments-worker.js';
import { EXPIRE_ORDERS_JOB_ID } from './jobs/process-payment-event.js';

const mocks = vi.hoisted(() => ({
  queueConstructor: vi.fn(),
  workerConstructor: vi.fn(),
  upsertJobScheduler: vi.fn(async (..._args: unknown[]) => undefined),
  workerOn: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock('bullmq', () => {
  class Queue {
    constructor(name: string, options: unknown) {
      mocks.queueConstructor(name, options);
    }

    async upsertJobScheduler(...args: unknown[]) {
      return mocks.upsertJobScheduler(...args);
    }
  }

  class Worker {
    constructor(name: string, processor: unknown, options: unknown) {
      mocks.workerConstructor(name, processor, options);
    }

    on(...args: unknown[]) {
      return mocks.workerOn(...args);
    }
  }

  return { Queue, Worker };
});

vi.mock('./create-payments-worker-deps.js', () => ({
  createPaymentsWorkerDeps: () => ({
    confirmOrderPayment: { execute: vi.fn() },
    failOrder: { execute: vi.fn() },
    expirePendingOrders: { execute: vi.fn() },
    transferOrganizerShare: { execute: vi.fn() },
  }),
}));

const db = {} as Db;
const connection = {} as RedisClient;

describe('createPaymentsWorker', () => {
  it('configura seis tentativas com backoff exponencial na fila de pagamentos', async () => {
    await createPaymentsWorker({ db, connection });

    const [, options] = mocks.queueConstructor.mock.calls[0] as [
      string,
      { defaultJobOptions: unknown },
    ];
    expect(options.defaultJobOptions).toEqual({
      attempts: 6,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnFail: true,
    });
  });

  it('configura as mesmas tentativas no job de expiração de pedidos', async () => {
    await createPaymentsWorker({ db, connection });

    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      EXPIRE_ORDERS_JOB_ID,
      expect.anything(),
      {
        name: EXPIRE_ORDERS_JOB_ID,
        opts: {
          attempts: 6,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnFail: true,
        },
      },
    );
  });
});
