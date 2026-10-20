import type { Transporter } from 'nodemailer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSmtpEmailSender,
  createSmtpTransport,
} from './smtp-email-sender.js';

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createSmtpEmailSender', () => {
  it('envia o e-mail com o remetente do TICKETVIBE', async () => {
    const transport = {
      sendMail: vi.fn(async () => ({ messageId: 'test' })),
    } as unknown as Transporter;
    const sender = createSmtpEmailSender(transport);

    await sender.send({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'TICKETVIBE <no-reply@ticketvibe.local>',
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });
  });
});

describe('createSmtpTransport', () => {
  it('usa a porta 1025 quando o SMTP_PORT não é numérico', () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1');
    vi.stubEnv('SMTP_PORT', 'não-é-número');

    createSmtpTransport();

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    });
  });
});
