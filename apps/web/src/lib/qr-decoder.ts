import jsQR from 'jsqr';

export interface QrDecoder {
  decode(imageData: ImageData): string | null;
}

export function decodeQr(imageData: ImageData): string | null {
  return jsQR(imageData.data, imageData.width, imageData.height)?.data ?? null;
}
