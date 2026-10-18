import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 300;

export function signStripeWebhook(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  now?: Date;
}): boolean {
  if (!input.signature) return false;
  const parts = new Map(
    input.signature
      .split(',')
      .map((part) => part.split('=') as [string, string]),
  );
  const timestamp = Number(parts.get('t'));
  const provided = parts.get('v1');
  if (!Number.isFinite(timestamp) || !provided) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
