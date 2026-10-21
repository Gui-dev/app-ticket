'use client';

import { QRCodeSVG } from 'qrcode.react';

export interface TicketQrProps {
  code: string;
  size?: number;
}

export function TicketQr({ code, size = 192 }: TicketQrProps) {
  return (
    <figure
      aria-label="QR Code do ingresso"
      className="flex w-fit flex-col items-center gap-3 rounded-lg bg-white p-4"
    >
      <QRCodeSVG
        value={code}
        size={size}
        aria-label="QR Code do ingresso"
        className="h-auto max-w-full"
      />
      <figcaption>
        <code className="font-mono text-sm text-neutral-900">{code}</code>
      </figcaption>
    </figure>
  );
}
