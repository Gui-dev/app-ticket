import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClient } from '../../../redis/client.js';
import {
  EMAILS_QUEUE_NAME,
  ORDER_CONFIRMATION_JOB,
} from '../domain/order-confirmation-queue.js';
import { createBullMqOrderConfirmationQueue } from './bullmq-order-confirmation-queue.js';

const mocks = vi.hoisted(() => ({
  queueConstructor: vi.fn(),
  add: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('bullmq', () => {
  class Queue {
    constructor(name: string, options: unknown) {
      mocks.queueConstructor(name, options);
    }

    async add(...args: unknown[]) {
      return mocks.add(...args);
    }
  }

  return { Queue };
});

const connection = {} as RedisClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createBullMqOrderConfirmationQueue', () => {
  it('cria a fila de e-mails com a conexão recebida', () => {
    createBullMqOrderConfirmationQueue({ connection });

    expect(mocks.queueConstructor).toHaveBeenCalledWith(EMAILS_QUEUE_NAME, {
      connection,
    });
  });

  it('enfileira a confirmação do pedido com jobId determinístico', async () => {
    const queue = createBullMqOrderConfirmationQueue({ connection });

    await queue.enqueue({ orderId: 'order-123' });

    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith(
      ORDER_CONFIRMATION_JOB,
      { orderId: 'order-123' },
      { jobId: 'order-confirmation-order-123' },
    );
  });
});
