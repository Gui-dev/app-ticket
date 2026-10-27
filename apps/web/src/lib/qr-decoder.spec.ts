import { describe, expect, it } from 'vitest';

import { decodeQr } from './qr-decoder';

function imagemDeRuido() {
  return {
    data: new Uint8ClampedArray(64 * 64 * 4),
    width: 64,
    height: 64,
  } as unknown as ImageData;
}

describe('decodeQr', () => {
  it('retorna null para uma imagem de ruído sem QR', () => {
    expect(decodeQr(imagemDeRuido())).toBeNull();
  });
});
