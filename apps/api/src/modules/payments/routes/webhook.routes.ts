import type { FastifyInstance } from 'fastify';

import type { PaymentEventRepository } from '../../orders/domain/payment-event-repository.js';
import type { PaymentEventQueue } from '../domain/payment-event-queue.js';
import type { PaymentProvider } from '../domain/payment-provider.js';

interface WebhookRoutesDeps {
  paymentProvider: PaymentProvider;
  paymentEventRepository: PaymentEventRepository;
  paymentEventQueue: PaymentEventQueue;
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: WebhookRoutesDeps,
): void {
  app.post('/webhooks/stripe', async (request, reply) => {
    const signature =
      (request.headers['stripe-signature'] as string | undefined) ?? null;
    const event = await deps.paymentProvider.parseWebhook({
      rawBody: (request as { rawBody?: string }).rawBody ?? '',
      signature,
    });
    if (!event) return reply.code(400).send({ error: 'invalid_signature' });
    const fresh = await deps.paymentEventRepository.record({
      providerEventId: event.providerEventId,
      provider: deps.paymentProvider.providerName,
      type: event.type,
    });
    await deps.paymentEventQueue.enqueue({
      providerEventId: event.providerEventId,
      type: event.type,
      providerRef: event.providerRef,
      amountCents: event.amountCents,
    });
    if (!fresh) return reply.send({ received: true, duplicate: true });
    return reply.send({ received: true });
  });
}
