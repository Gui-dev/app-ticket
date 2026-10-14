'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from '@/lib/auth-errors';
import { Button } from './ui/button';
import { Input } from './ui/input';

function RecoverPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: String(form.get('email') ?? ''),
        redirectTo: '/redefinir-senha',
      });
      if (authError) {
        setError(formatAuthError(authError.code));
        return;
      }
      setSent(true);
    } catch {
      setError(formatAuthError(undefined));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Link enviado</h1>
        <p className="text-sm text-muted-foreground">
          Se o e-mail existir em nossa base, você receberá um link de
          recuperação. Confira também a caixa de spam.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/entrar" className="text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Recuperar senha</h1>
      <p className="text-sm text-muted-foreground">
        Informe o e-mail da sua conta. Enviaremos um link para criar uma nova
        senha.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label
        htmlFor="recover-email"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        E-mail
        <Input
          id="recover-email"
          type="email"
          name="email"
          required
          autoComplete="email"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar link'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Lembrou a senha?{' '}
        <Link href="/entrar" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export { RecoverPasswordForm };
