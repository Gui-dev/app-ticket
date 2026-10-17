import {
  cartItemRequestSchema,
  cartSchema,
  setCartItemResponseSchema,
} from '@ticketvibe/shared';
import type { FastifyInstance } from 'fastify';

import type { GetSessionFn } from '../../auth/get-session.js';
import type { GetCartUseCase } from '../use-cases/get-cart.use-case.js';
import type { SetCartItemUseCase } from '../use-cases/set-cart-item.use-case.js';

interface CartRoutesDeps {
  getSession: GetSessionFn;
  getCart: GetCartUseCase;
  setCartItem: SetCartItemUseCase;
}

export function registerCartRoutes(
  app: FastifyInstance,
  deps: CartRoutesDeps,
): void {
  app.get('/events/:slug/cart', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.getCart.execute(session.userId, slug);
    if (result.kind === 'event_not_found') {
      return reply.code(404).send({ error: 'event_not_found' });
    }
    const payload = cartSchema.parse({
      eventSlug: result.cart.eventSlug,
      items: result.cart.items.map((item) => ({
        ...item,
        expiresAt: item.expiresAt.toISOString(),
      })),
      expiresAt: result.cart.expiresAt?.toISOString() ?? null,
      totalCents: result.cart.totalCents,
    });
    return reply.send(payload);
  });

  app.put('/events/:slug/cart/items', async (request, reply) => {
    const session = await deps.getSession(request.headers);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = cartItemRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { slug } = request.params as { slug: string };
    const result = await deps.setCartItem.execute({
      userId: session.userId,
      eventSlug: slug,
      sectorSlug: parsed.data.sectorSlug,
      rowLabel: parsed.data.rowLabel,
      seatLabel: parsed.data.seatLabel,
      ticketType: parsed.data.ticketType,
    });
    switch (result.kind) {
      case 'event_not_found':
      case 'sector_not_found':
      case 'seat_not_found':
      case 'hold_not_found':
        return reply.code(404).send({ error: result.kind });
      case 'cart_item_set':
        return reply.send(
          setCartItemResponseSchema.parse({ item: result.item }),
        );
    }
  });
}
