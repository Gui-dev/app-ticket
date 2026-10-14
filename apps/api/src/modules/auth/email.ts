import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailFn = (input: SendEmailInput) => Promise<void>;

let transporter: Transporter | undefined;

const getTransporter = (): Transporter => {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? '127.0.0.1',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  return transporter;
};

export const sendEmail: SendEmailFn = async ({ to, subject, text }) => {
  await getTransporter().sendMail({
    from: 'TICKETVIBE <no-reply@ticketvibe.local>',
    to,
    subject,
    text,
  });
};
