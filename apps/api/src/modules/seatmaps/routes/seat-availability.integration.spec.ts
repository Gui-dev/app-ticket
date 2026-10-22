import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';
import { createDb, type Db, TEST_DATABASE_URL } from '../../../db/client.js';
import { seedFixtures } from '../../../db/seed-fixtures.js';
import {
  ensureTestDatabase,
  migrateTestDatabase,
  resetDatabase,
} from '../../../db/test-helpers.js';
import { createRedis, type RedisClient } from '../../../redis/client.js';
import { DrizzleSeatmapRepository } from '../infra/drizzle-seatmap-repository.js';
import { InMemorySeatAvailabilityBroker } from '../infra/in-memory-seat-availability-broker.js';
import {
  createRedisSeatAvailabilityBroker,
  SEAT_AVAILABILITY_CHANNEL,
} from '../infra/redis-seat-availability-broker.js';

interface TestCloseEvent {
  code: number;
}

class TestWebSocketClient {
  readonly socket: WebSocket;
  readonly closed: Promise<TestCloseEvent>;
  private readonly queue: string[] = [];
  private readonly waiters: Array<(value: string) => void> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter(data);
        } else {
          this.queue.push(data);
        }
      }
    });
    this.closed = new Promise((resolve) => {
      this.socket.addEventListener('close', (event) =>
        resolve({ code: (event as CloseEvent).code }),
      );
    });
  }

  nextMessage(): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  closeClient(): void {
    this.socket.close();
  }
}

async function waitForSeatAvailabilityChannel(
  redis: RedisClient,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const channels = (await redis.pubsub('CHANNELS')) as unknown as string[];
    if (channels.includes(SEAT_AVAILABILITY_CHANNEL)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('assinatura de disponibilidade de assentos não iniciou');
}

describe('websocket de disponibilidade de assentos (postgres integration)', () => {
  let app: FastifyInstance;
  let testDb: Db;
  let redis: RedisClient;
  let port: number;
  const clients: TestWebSocketClient[] = [];

  const openWebSocket = (slug: string): TestWebSocketClient => {
    const client = new TestWebSocketClient(
      `ws://127.0.0.1:${port}/events/${slug}/seat-availability`,
    );
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    testDb = createDb(TEST_DATABASE_URL);
    await migrateTestDatabase(testDb);
    app = buildApp({
      seatmapRepository: new DrizzleSeatmapRepository(
        testDb,
        new InMemorySeatAvailabilityBroker(),
      ),
    });
    await app.ready();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('endereço do servidor indisponível');
    }
    port = address.port;
    redis = createRedis();
    await redis.connect();
  });

  beforeEach(async () => {
    await resetDatabase(testDb);
    await seedFixtures(testDb);
  });

  afterAll(async () => {
    for (const client of clients) {
      client.closeClient();
    }
    await app.close();
    await testDb.$client.end();
    await redis.quit();
  });

  it('responde connected e entrega delta para a room certa', async () => {
    const playerA = openWebSocket('o-fantasma-da-opera');
    const playerB = openWebSocket('o-fantasma-da-opera');
    const strayClient = openWebSocket('evento-sem-fixture-nenhum');

    const connectedA = seatAvailabilityMessageSchema.parse(
      JSON.parse(await playerA.nextMessage()),
    );
    const connectedB = seatAvailabilityMessageSchema.parse(
      JSON.parse(await playerB.nextMessage()),
    );
    expect(connectedA).toMatchObject({
      type: 'connected',
      eventSlug: 'o-fantasma-da-opera',
    });
    expect(connectedB).toEqual(connectedA);

    await strayClient.closed.then((close) => {
      expect(close.code).toBe(4004);
    });

    await waitForSeatAvailabilityChannel(redis);

    const broker = createRedisSeatAvailabilityBroker(redis);
    broker.publish([
      {
        eventSlug: 'o-fantasma-da-opera',
        sectorSlug: 'plateia',
        rowLabel: 'A',
        seatLabel: '1',
        status: 'occupied',
      },
    ]);

    const deltaA = seatAvailabilityMessageSchema.parse(
      JSON.parse(await playerA.nextMessage()),
    );
    const deltaB = seatAvailabilityMessageSchema.parse(
      JSON.parse(await playerB.nextMessage()),
    );
    expect(deltaA).toMatchObject({
      type: 'seat_status_changed',
      eventSlug: 'o-fantasma-da-opera',
      changes: [
        {
          sectorSlug: 'plateia',
          rowLabel: 'A',
          seatLabel: '1',
          status: 'occupied',
        },
      ],
    });
    expect(deltaB).toEqual(deltaA);
  });

  it('fecha com 4004 para evento inexistente', async () => {
    const client = openWebSocket('outro-evento-inexistente');
    const { code } = await client.closed;
    expect(code).toBe(4004);
  });
});
