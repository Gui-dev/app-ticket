import type { TicketType } from '@ticketvibe/shared';

import type { CartRepository } from '../domain/cart-repository.js';

interface CartEntry {
  ticketType: TicketType;
  expiresAtMs: number;
}

export class InMemoryCartRepository implements CartRepository {
  private readonly carts = new Map<string, Map<string, CartEntry>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private cart(userId: string, eventSlug: string): Map<string, CartEntry> {
    const key = `${userId}:${eventSlug}`;
    let cart = this.carts.get(key);
    if (!cart) {
      cart = new Map<string, CartEntry>();
      this.carts.set(key, cart);
    }
    return cart;
  }

  async setType(input: {
    userId: string;
    eventSlug: string;
    itemKey: string;
    ticketType: TicketType;
    ttlSeconds: number;
  }): Promise<void> {
    this.cart(input.userId, input.eventSlug).set(input.itemKey, {
      ticketType: input.ticketType,
      expiresAtMs: this.now().getTime() + input.ttlSeconds * 1000,
    });
  }

  async getTypes(input: {
    userId: string;
    eventSlug: string;
  }): Promise<Map<string, TicketType>> {
    const cart = this.cart(input.userId, input.eventSlug);
    const nowMs = this.now().getTime();
    const result = new Map<string, TicketType>();
    for (const [itemKey, entry] of cart) {
      if (entry.expiresAtMs > nowMs) {
        result.set(itemKey, entry.ticketType);
      } else {
        cart.delete(itemKey);
      }
    }
    return result;
  }

  async refreshTtl(input: {
    userId: string;
    eventSlug: string;
    ttlSeconds: number;
  }): Promise<void> {
    const cart = this.carts.get(`${input.userId}:${input.eventSlug}`);
    if (!cart) return;
    const expiresAtMs = this.now().getTime() + input.ttlSeconds * 1000;
    for (const entry of cart.values()) {
      entry.expiresAtMs = expiresAtMs;
    }
  }

  async clear(input: { userId: string; eventSlug: string }): Promise<void> {
    this.carts.delete(`${input.userId}:${input.eventSlug}`);
  }
}
