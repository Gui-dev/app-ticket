'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from './login-form';
import { Button } from './ui/button';
import { Input } from './ui/input';

function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    try {
      const { error: authError } = await authClient.signUp.email({
        name: String(form.get('name') ?? ''),
        email,
        password: String(form.get('password') ?? ''),
      });
      if (authError) {
        setError(formatAuthError(authError.code));
        return;
      }
      setSentTo(email);
    } catch {
      setError(formatAuthError(undefined));
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">
          Verifique seu e-mail
        </h1>
        <p className="text-sm text-muted-foreground">
          Enviamos um link de confirmação para <strong>{sentTo}</strong>. Acesse
          o link para ativar sua conta e depois faça login.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/entrar" className="text-primary hover:underline">
            Já tenho conta — Entrar
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
      <h1 className="font-heading text-2xl font-bold">Criar conta</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label
        htmlFor="signup-name"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Nome
        <Input
          id="signup-name"
          type="text"
          name="name"
          required
          autoComplete="name"
        />
      </label>
      <label
        htmlFor="signup-email"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        E-mail
        <Input
          id="signup-email"
          type="email"
          name="email"
          required
          autoComplete="email"
        />
      </label>
      <label
        htmlFor="signup-password"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Senha
        <Input
          id="signup-password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Criando conta…' : 'Criar conta'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/entrar" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export { SignupForm };
