import { describe, expect, it } from 'vitest';

import { refundAmountFor, refundOutcomeFor } from './refund-policy.js';

const STARTS_AT = new Date('2026-10-18T20:00:00.000Z');

describe('refundOutcomeFor', () => {
  it('permite o cancelamento dentro da janela', () => {
    expect(
      refundOutcomeFor({
        now: new Date('2026-10-17T19:00:00.000Z'),
        startsAt: STARTS_AT,
        windowHours: 24,
        refundPercent: 70,
      }),
    ).toBe('allowed');
  });

  it('permite o cancelamento exatamente na borda da janela', () => {
    expect(
      refundOutcomeFor({
        now: new Date('2026-10-17T20:00:00.000Z'),
        startsAt: STARTS_AT,
        windowHours: 24,
        refundPercent: 70,
      }),
    ).toBe('allowed');
  });

  it('recusa o cancelamento fora da janela', () => {
    expect(
      refundOutcomeFor({
        now: new Date('2026-10-17T20:00:01.000Z'),
        startsAt: STARTS_AT,
        windowHours: 24,
        refundPercent: 70,
      }),
    ).toBe('window_closed');
  });

  it('recusa o reembolso quando a porcentagem é zero', () => {
    expect(
      refundOutcomeFor({
        now: new Date('2026-10-17T20:00:00.000Z'),
        startsAt: STARTS_AT,
        windowHours: 24,
        refundPercent: 0,
      }),
    ).toBe('not_allowed');
  });

  it('permite o cancelamento com janela zero antes do evento', () => {
    expect(
      refundOutcomeFor({
        now: new Date('2026-10-18T19:00:00.000Z'),
        startsAt: STARTS_AT,
        windowHours: 0,
        refundPercent: 70,
      }),
    ).toBe('allowed');
  });
});

describe('refundAmountFor', () => {
  it('calcula setenta por cento do total', () => {
    expect(refundAmountFor(9000, 70)).toBe(6300);
  });

  it('arredonda para baixo em valores não inteiros', () => {
    expect(refundAmountFor(999, 50)).toBe(500);
  });

  it('devolve o total completo com cem por cento', () => {
    expect(refundAmountFor(19800, 100)).toBe(19800);
  });
});
