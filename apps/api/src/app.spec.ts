import { healthResponseSchema } from '@ticketvibe/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('GET /health', () => {
  it('returns a contract-valid ok payload', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: 'ok',
    });

    await app.close();
  });
});

describe('parser global de json', () => {
  it('responde 400 quando o corpo não é um json válido', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'content-type': 'application/json' },
      payload: '{"paymentMethod":',
    });

    const body = response.json() as { statusCode?: number; code?: string };
    expect(response.statusCode).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('FST_ERR_CTP_INVALID_JSON_BODY');

    await app.close();
  });

  it('responde 400 quando o corpo está vazio', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/events/o-fantasma-da-opera/orders',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    const body = response.json() as { statusCode?: number; code?: string };
    expect(response.statusCode).toBe(400);
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');

    await app.close();
  });

  it('guarda o corpo bruto na requisição e devolve o objeto lido', async () => {
    const app = buildApp();
    app.post('/eco-do-corpo', async (request) => ({
      rawBody: (request as { rawBody?: string }).rawBody ?? null,
      body: request.body ?? null,
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/eco-do-corpo',
      headers: { 'content-type': 'application/json' },
      payload: '{"paymentMethod":"boleto"}',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rawBody: '{"paymentMethod":"boleto"}',
      body: { paymentMethod: 'boleto' },
    });

    await app.close();
  });
});
