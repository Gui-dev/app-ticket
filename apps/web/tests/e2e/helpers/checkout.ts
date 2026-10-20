import { type APIRequestContext, expect } from '@playwright/test';

import { signStripeWebhook } from './stripe';

const API_URL = 'http://127.0.0.1:3001';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

export async function approvePayment(
  request: APIRequestContext,
  order: { providerRef: string; totalCents: number },
): Promise<string> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = JSON.stringify({
    id: eventId,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: order.providerRef,
        amount_received: order.totalCents,
      },
    },
  });
  const response = await request.post(`${API_URL}/webhooks/stripe`, {
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signStripeWebhook(payload, WEBHOOK_SECRET),
    },
    data: payload,
  });
  const body = await response.text();
  expect(
    response.status(),
    `webhook recusado: ${response.status()} ${body}`,
  ).toBe(200);
  return eventId;
}
