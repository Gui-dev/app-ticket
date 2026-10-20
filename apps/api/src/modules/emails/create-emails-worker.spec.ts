import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../db/client.js';
import type { RedisClient } from '../../redis/client.js';
import { createEmailsWorker } from './create-emails-worker.js';
import { EMAIL_JOB_OPTIONS } from './domain/order-confirmation-queue.js';

const mocks = vi.hoisted(() => ({
  queueConstructor: vi.fn(),
  workerConstructor: vi.fn(),
  workerOn: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock('bullmq', () => {
  class Queue {
    constructor(name: string, options: unknown) {
      mocks.queueConstructor(name, options);
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

const db = {} as Db;
const connection = {} as RedisClient;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createEmailsWorker', () => {
  it('aplica as opções do job de e-mail na fila', async () => {
    await createEmailsWorker({ db, connection });

    expect(mocks.queueConstructor).toHaveBeenCalledTimes(1);
    const [, options] = mocks.queueConstructor.mock.calls[0] as [
      string,
      { defaultJobOptions: unknown },
    ];
    expect(options.defaultJobOptions).toEqual(EMAIL_JOB_OPTIONS);
    expect(options.defaultJobOptions).toEqual({
      attempts: 6,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnFail: true,
      removeOnComplete: true,
    });
  });

  it('registra um listener de erro que loga o erro fatal do worker', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await createEmailsWorker({ db, connection });

    const errorListener = mocks.workerOn.mock.calls.find(
      ([event]) => event === 'error',
    );
    expect(errorListener).toBeDefined();

    const handler = errorListener?.[1] as (error: Error) => void;
    const failure = new Error('redis indisponível');
    handler(failure);

    expect(logged).toHaveBeenCalledWith('[worker] email worker error', failure);
  });
});
