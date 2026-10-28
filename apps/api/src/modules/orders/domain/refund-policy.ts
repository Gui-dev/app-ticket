export type RefundOutcome = 'allowed' | 'window_closed' | 'not_allowed';

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_REFUND_PERCENT = 100;

export function refundOutcomeFor(input: {
  now: Date;
  startsAt: Date;
  windowHours?: number;
  refundPercent?: number;
}): RefundOutcome {
  const percent = input.refundPercent ?? DEFAULT_REFUND_PERCENT;
  if (percent <= 0) return 'not_allowed';
  const windowHours = input.windowHours ?? DEFAULT_WINDOW_HOURS;
  const windowMs = windowHours * 3_600_000;
  if (input.now.getTime() > input.startsAt.getTime() - windowMs) {
    return 'window_closed';
  }
  return 'allowed';
}

export function refundAmountFor(totalCents: number, percent: number): number {
  return Math.round((totalCents * percent) / 100);
}
