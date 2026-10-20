import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

import type { EmailSender } from '../domain/email-sender.js';

const DEFAULT_SMTP_PORT = 1025;
const FROM = 'TICKETVIBE <no-reply@ticketvibe.local>';

const resolvePort = (raw: string | undefined): number => {
  const port = Number.parseInt(raw ?? `${DEFAULT_SMTP_PORT}`, 10);
  return Number.isFinite(port) ? port : DEFAULT_SMTP_PORT;
};

export function createSmtpTransport(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: resolvePort(process.env.SMTP_PORT),
    secure: false,
  });
}

export function createSmtpEmailSender(
  transport: Transporter = createSmtpTransport(),
): EmailSender {
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: FROM, to, subject, text });
    },
  };
}
