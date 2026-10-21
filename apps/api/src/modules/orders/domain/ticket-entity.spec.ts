import { describe, expect, it } from 'vitest';

import { generateTicketCode, ticketStatusFor } from './ticket-entity.js';

describe('generateTicketCode', () => {
  it('gera um código de 22 caracteres URL-safe', () => {
    expect(generateTicketCode()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('gera códigos distintos', () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateTicketCode()),
    );
    expect(codes.size).toBe(500);
  });
});

describe('ticketStatusFor', () => {
  it('marca o ingresso como válido quando o pedido foi pago', () => {
    expect(ticketStatusFor('paid')).toBe('valid');
  });

  it('marca o ingresso como inválido quando o pedido está pendente', () => {
    expect(ticketStatusFor('pending')).toBe('invalid');
  });

  it('marca o ingresso como inválido quando o pedido falhou', () => {
    expect(ticketStatusFor('failed')).toBe('invalid');
  });

  it('marca o ingresso como inválido quando o pedido expirou', () => {
    expect(ticketStatusFor('expired')).toBe('invalid');
  });
});
