import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({
      status: 'ok',
    });
  });

  it('rejects a payload that is not ok', () => {
    expect(() => healthResponseSchema.parse({ status: 'down' })).toThrow();
  });
});
