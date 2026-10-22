import type { Db } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';
import type { SeatAvailabilityBroker } from '../domain/seat-availability-broker.js';

export const SEAT_HOLD_QUEUE_NAME = 'seat-hold-expiry';
export const EXPIRE_HOLDS_JOB_ID = 'expire-seat-holds';
export const EXPIRE_HOLDS_EVERY_MS = 5_000;

export function createExpireSeatHoldsJob(
  db: Db,
  broker: SeatAvailabilityBroker,
): () => Promise<number> {
  return async () => {
    const expired = await expireExpiredHolds(db);
    if (expired.length > 0) {
      broker.publish(
        expired.map((seat) => ({
          eventSlug: seat.eventSlug,
          sectorSlug: seat.sectorSlug,
          rowLabel: seat.rowLabel,
          seatLabel: seat.seatLabel,
          status: 'available' as const,
        })),
      );
    }
    return expired.length;
  };
}
