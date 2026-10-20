import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';

import { createSmtpEmailSender } from './smtp-email-sender.js';

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
