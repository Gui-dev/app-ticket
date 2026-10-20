import type { EmailSender } from '../emails/domain/email-sender.js';
import {
  createSmtpEmailSender,
  createSmtpTransport,
} from '../emails/infra/smtp-email-sender.js';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailFn = (input: SendEmailInput) => Promise<void>;

let sender: EmailSender | undefined;

const getSender = (): EmailSender => {
  sender ??= createSmtpEmailSender(createSmtpTransport());
  return sender;
};

export const sendEmail: SendEmailFn = async (input) => {
  await getSender().send(input);
};
