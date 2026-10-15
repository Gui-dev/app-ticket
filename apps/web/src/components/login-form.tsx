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

  async function handleGoogle() {
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
      if (authError) {
        setError(formatAuthError(authError.code));
      }
      // Em sucesso o redirectPlugin do better-auth navega o browser para o Google.
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
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogle}
        disabled={pending}
      >
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.35 11.1h-9.17v2.98h5.3c-.23 1.4-1.63 4.1-5.3 4.1-3.19 0-5.8-2.64-5.8-5.88s2.61-5.88 5.8-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.8 3.86 14.68 2.9 12.18 2.9 7.03 2.9 2.85 7.08 2.85 12.23s4.18 9.33 9.33 9.33c5.39 0 8.95-3.78 8.95-9.11 0-.61-.07-1.08-.18-1.35z"
          />
        </svg>
        Entrar com Google
      </Button>
      <div className="relative text-center text-sm text-muted-foreground">
        <span className="relative z-10 bg-card px-2">ou com e-mail</span>
        <div
          className="absolute inset-x-0 top-1/2 h-px bg-border"
          aria-hidden="true"
        />
      </div>
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
