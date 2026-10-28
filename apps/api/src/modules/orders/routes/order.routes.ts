import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  type OrderDto,
  orderDetailResponseSchema,
  orderListResponseSchema,
  orderResponseSchema,
  orderSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { EventsRepository } from '../../events/domain/events-repository.js';
import type { OrderRecord } from '../domain/order-entity.js';
import type { OrderRepository } from '../domain/order-repository.js';
import { type TicketRecord, ticketStatusFor } from '../domain/ticket-entity.js';
import type { TicketRepository } from '../domain/ticket-repository.js';
import type {
  CancelOrderResult,
  CancelOrderUseCase,
} from '../use-cases/cancel-order.use-case.js';
import type { CreateOrderUseCase } from '../use-cases/create-order.use-case.js';

interface OrderRoutesDeps {
  getSession: GetSessionFn;
  createOrder: CreateOrderUseCase;
  cancelOrder: CancelOrderUseCase;
  orderRepository: OrderRepository;
  ticketRepository: TicketRepository;
  eventsRepository: EventsRepository;
}

const orderIdSchema = orderSchema.shape.id;

const CANCEL_ERRORS: Record<
  Exclude<CancelOrderResult['kind'], 'ok'>,
  { status: number; error: string }
> = {
  order_not_found: { status: 404, error: 'order_not_found' },
  order_not_cancellable: { status: 409, error: 'order_not_cancellable' },
  refund_window_closed: { status: 409, error: 'refund_window_closed' },
  refund_not_allowed: { status: 409, error: 'refund_not_allowed' },
  refund_provider_error: { status: 502, error: 'refund_provider_error' },
};

function serializeOrder(
  order: OrderRecord,
  ticketsBySeatId?: Map<string, TicketRecord>,
): OrderDto {
  return {
    id: order.id,
    eventSlug: order.eventSlug,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotalCents: order.subtotalCents,
    serviceFeeCents: order.serviceFeeCents,
    totalCents: order.totalCents,
    refundCents: order.refundCents,
    items: order.items.map((item) => {
      const ticket = ticketsBySeatId?.get(item.seatId);
      return {
        sectorSlug: item.sectorSlug,
        sectorName: item.sectorName,
        rowLabel: item.rowLabel,
        seatLabel: item.seatLabel,
        ticketType: item.ticketType,
        priceCents: item.priceCents,
        ticket: ticket
          ? { code: ticket.code, status: ticketStatusFor(order.status) }
          : null,
      };
    }),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}

export function registerOrderRoutes(
  app: FastifyInstance,
  deps: OrderRoutesDeps,
): void {
  app.post('/events/:slug/orders', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (session.isAnonymous) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = createOrderRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.createOrder.execute({
      userId: session.userId,
      eventSlug: slug,
      paymentMethod: parsed.data.paymentMethod,
      buyerEmail: session.email ?? null,
    });
    switch (result.kind) {
      case 'event_not_found':
        return reply.code(404).send({ error: 'event_not_found' });
      case 'empty_cart':
        return reply.code(409).send({ error: 'empty_cart' });
      case 'seat_unavailable':
        return reply
          .code(409)
          .send({ error: 'seat_unavailable', seat: result.seat });
      case 'payment_failed':
        return reply.code(502).send({ error: 'payment_failed' });
      case 'created':
        if (result.payment.providerRef === null) {
          return reply.code(503).send({ error: 'order_in_progress' });
        }
        return reply.code(201).send(
          createOrderResponseSchema.parse({
            order: serializeOrder(result.order),
            payment: result.payment,
          }),
        );
    }
  });

  app.get('/orders', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session || session.isAnonymous) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const orders = await deps.orderRepository.listByUser({
      userId: session.userId,
      limit: 50,
    });
    const events = await deps.eventsRepository.findBySlugs(
      orders.map((order) => order.eventSlug),
    );
    const eventsBySlug = new Map(events.map((event) => [event.slug, event]));
    return reply.send(
      orderListResponseSchema.parse({
        orders: orders.map((order) => {
          const event = eventsBySlug.get(order.eventSlug);
          return {
            id: order.id,
            eventSlug: order.eventSlug,
            eventTitle: event?.title ?? order.eventSlug,
            eventStartsAt: (event?.startsAt ?? order.createdAt).toISOString(),
            status: order.status,
            subtotalCents: order.subtotalCents,
            serviceFeeCents: order.serviceFeeCents,
            totalCents: order.totalCents,
            itemCount: order.itemCount,
            createdAt: order.createdAt.toISOString(),
          };
        }),
      }),
    );
  });

  app.post('/orders/:id/cancel', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session || session.isAnonymous) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = request.params as { id: string };
    if (!orderIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    const result = await deps.cancelOrder.execute({
      orderId: id,
      userId: session.userId,
    });
    if (result.kind !== 'ok') {
      const mapped = CANCEL_ERRORS[result.kind];
      return reply.code(mapped.status).send({ error: mapped.error });
    }
    const order = await deps.orderRepository.findById(id);
    if (!order) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    return reply.send(
      orderResponseSchema.parse({ order: serializeOrder(order) }),
    );
  });

  app.get('/orders/:id', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { id } = request.params as { id: string };
    if (!orderIdSchema.safeParse(id).success) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    const order = await deps.orderRepository.findById(id);
    if (!order || order.userId !== session.userId) {
      return reply.code(404).send({ error: 'order_not_found' });
    }
    const tickets = await deps.ticketRepository.findByOrderId(order.id);
    const ticketsBySeatId = new Map(
      tickets.map((ticket) => [ticket.seatId, ticket]),
    );
    const [event] = await deps.eventsRepository.findBySlugs([order.eventSlug]);
    return reply.send(
      orderDetailResponseSchema.parse({
        order: serializeOrder(order, ticketsBySeatId),
        event: event
          ? {
              slug: event.slug,
              title: event.title,
              startsAt: event.startsAt.toISOString(),
            }
          : null,
      }),
    );
  });
}
