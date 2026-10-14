import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async () => ({ messageId: 'test' }));
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

const { sendEmail } = await import('./email.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendEmail', () => {
  it('cria o transporter apontando para o Mailpit por default', async () => {
    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    });
  });

  it('envia o e-mail com from, to, subject e text', async () => {
    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'TICKETVIBE <no-reply@ticketvibe.local>',
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });
  });
});
