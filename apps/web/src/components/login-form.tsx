'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from '@/lib/auth-errors';
import { Button } from './ui/button';
import { Input } from './ui/input';

function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error: authError } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      if (authError) {
        setError(formatAuthError(authError.code));
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError(formatAuthError(undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Entrar</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label
        htmlFor="login-email"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        E-mail
        <Input
          id="login-email"
          type="email"
          name="email"
          required
          autoComplete="email"
        />
      </label>
      <label
        htmlFor="login-password"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Senha
        <Input
          id="login-password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link href="/recuperar-senha" className="text-primary hover:underline">
          Esqueci a senha
        </Link>
      </p>
      <p className="text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link href="/cadastro" className="text-primary hover:underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

export { LoginForm };
