import { expect, test } from 'vitest';
import { formatBRL, formatDatePtBR } from './format';

test('formats ISO date to pt-BR long date', () => {
  expect(formatDatePtBR('2026-10-22T20:00:00-03:00')).toBe(
    '22 de Outubro, 2026',
  );
});

test('converts UTC instants to America/Sao_Paulo before formatting', () => {
  expect(formatDatePtBR('2026-10-23T02:00:00Z')).toBe('22 de Outubro, 2026');
});

test('formats a December date with zero-padded day', () => {
  expect(formatDatePtBR('2026-12-05T14:00:00-03:00')).toBe(
    '05 de Dezembro, 2026',
  );
});

test('formats cents as BRL currency', () => {
  expect(formatBRL(12000)).toBe('R$ 120,00');
});

test('formats fractional cents as BRL currency', () => {
  expect(formatBRL(18990)).toBe('R$ 189,90');
});
