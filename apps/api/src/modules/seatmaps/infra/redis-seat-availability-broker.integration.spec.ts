import { seatAvailabilityMessageSchema } from '@ticketvibe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createRedis,
  type RedisClient,
  TEST_REDIS_URL,
} from '../../../redis/client.js';
import {
  createRedisSeatAvailabilityBroker,
  SEAT_AVAILABILITY_CHANNEL,
  subscribeSeatAvailabilityFanout,
} from './redis-seat-availability-broker.js';

describe('createRedisSeatAvailabilityBroker (redis integration)', () => {
  let publisher: RedisClient;
  let subscriber: RedisClient;

  beforeAll(async () => {
    publisher = createRedis(TEST_REDIS_URL);
    await publisher.connect();
    subscriber = createRedis(TEST_REDIS_URL);
    await subscriber.connect();
  });

  afterAll(async () => {
    await publisher.quit();
    await subscriber.quit();
  });

  it('publica uma mensagem agrupada por evento no canal', async () => {
    const primeiroTextoRecebido = new Promise<string>((resolve) => {
      subscribeSeatAvailabilityFanout(subscriber, {
        fanout: (text) => resolve(text),
      });
    });
    await subscriber.subscribe(SEAT_AVAILABILITY_CHANNEL);

    const broker = createRedisSeatAvailabilityBroker(publisher);
    broker.publish([
      {
        eventSlug: 'o-fantasma-da-opera',
        sectorSlug: 'plateia',
        rowLabel: 'Fila A',
        seatLabel: 'Cadeira 1',
        status: 'occupied',
      },
      {
        eventSlug: 'les-miserables',
        sectorSlug: 'plateia',
        rowLabel: 'Fila B',
        seatLabel: 'Cadeira 2',
        status: 'available',
      },
    ]);

    let timer: NodeJS.Timeout | undefined;
    const text = await Promise.race([
      primeiroTextoRecebido,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('mensagem não recebida')),
          3000,
        );
      }),
    ]);
    clearTimeout(timer);

    const parsed = seatAvailabilityMessageSchema.parse(JSON.parse(text));
    expect(parsed).toEqual({
      type: 'seat_status_changed',
      eventSlug: 'o-fantasma-da-opera',
      changes: [
        {
          sectorSlug: 'plateia',
          rowLabel: 'Fila A',
          seatLabel: 'Cadeira 1',
          status: 'occupied',
        },
      ],
    });
  });
});
