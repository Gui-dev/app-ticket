import type { Db } from '../../../db/client.js';
import { expireExpiredHolds } from '../../../db/hold-expiry.js';

export const SEAT_HOLD_QUEUE_NAME = 'seat-hold-expiry';
export const EXPIRE_HOLDS_JOB_ID = 'expire-seat-holds';
export const EXPIRE_HOLDS_EVERY_MS = 5_000;

export function createExpireSeatHoldsJob(db: Db): () => Promise<number> {
  return () => expireExpiredHolds(db);
}
