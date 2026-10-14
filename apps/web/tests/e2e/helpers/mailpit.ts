import type { APIRequestContext } from '@playwright/test';

const MAILPIT_API = 'http://127.0.0.1:8025/api/v1';

type MailpitListItem = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

export async function clearMailbox(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_API}/messages`);
}

export async function waitForEmailLink(
  request: APIRequestContext,
  to: string,
  subjectFragment: string,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${MAILPIT_API}/messages?limit=20`);
    const body = (await listResponse.json()) as {
      messages?: MailpitListItem[];
    };
    const match = (body.messages ?? []).find(
      (message) =>
        message.Subject.includes(subjectFragment) &&
        message.To.some((recipient) => recipient.Address === to),
    );
    if (match) {
      const fullResponse = await request.get(
        `${MAILPIT_API}/message/${match.ID}`,
      );
      const full = (await fullResponse.json()) as { Text?: string };
      const urlMatch = full.Text?.match(/https?:\/\/\S+/);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `E-mail para ${to} com assunto "${subjectFragment}" não chegou em 15s`,
  );
}
