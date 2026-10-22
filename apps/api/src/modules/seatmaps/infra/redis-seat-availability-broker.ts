import type { SeatStatusChange } from '@ticketvibe/shared';

import type { RedisClient } from '../../../redis/client.js';
import type {
  SeatAvailabilityBroker,
  SeatStatusDelta,
} from '../domain/seat-availability-broker.js';

export const SEAT_AVAILABILITY_CHANNEL = 'seat-availability';

export function createRedisSeatAvailabilityBroker(
  redis: RedisClient,
): SeatAvailabilityBroker {
  return {
    publish(deltas: SeatStatusDelta[]): void {
      const changesByEvent = new Map<string, SeatStatusChange[]>();
      for (const delta of deltas) {
        const change: SeatStatusChange = {
          sectorSlug: delta.sectorSlug,
          rowLabel: delta.rowLabel,
          seatLabel: delta.seatLabel,
          status: delta.status,
        };
        const changes = changesByEvent.get(delta.eventSlug);
        if (changes) {
          changes.push(change);
        } else {
          changesByEvent.set(delta.eventSlug, [change]);
        }
      }
      for (const [eventSlug, changes] of changesByEvent) {
        const message = {
          type: 'seat_status_changed' as const,
          eventSlug,
          changes,
        };
        const text = JSON.stringify(message);
        void redis.publish(SEAT_AVAILABILITY_CHANNEL, text).catch(() => {});
      }
    },
  };
}

export function subscribeSeatAvailabilityFanout(
  redis: RedisClient,
  fanout: { fanout(text: string): void },
): void {
  redis.on('message', (channel, text) => {
    if (channel === SEAT_AVAILABILITY_CHANNEL) fanout.fanout(text);
  });
  void redis.subscribe(SEAT_AVAILABILITY_CHANNEL);
}
