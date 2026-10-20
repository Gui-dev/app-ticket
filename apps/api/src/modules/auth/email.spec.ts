import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async () => ({ messageId: 'test' }));
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

const loadSendEmail = async () => {
  const { sendEmail } = await import('./email.js');
  return sendEmail;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendEmail', () => {
  it('cria o transporter apontando para o Mailpit por default', async () => {
    const sendEmail = await loadSendEmail();

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
    const sendEmail = await loadSendEmail();

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

  it('reutiliza a mesma instância de transporte entre envios', async () => {
    const sendEmail = await loadSendEmail();

    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });
    await sendEmail({
      to: 'outra@test.dev',
      subject: 'Outro assunto',
      text: 'Outro corpo',
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it('usa SMTP_HOST e SMTP_PORT do ambiente quando definidos', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.exemplo.dev');
    vi.stubEnv('SMTP_PORT', '2525');

    const sendEmail = await loadSendEmail();

    await sendEmail({
      to: 'alguem@test.dev',
      subject: 'Assunto',
      text: 'Corpo',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.exemplo.dev',
      port: 2525,
      secure: false,
    });
  });
});
