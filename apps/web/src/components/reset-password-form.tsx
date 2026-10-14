'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { formatAuthError } from './login-form';
import { Button } from './ui/button';
import { Input } from './ui/input';

type ResetPasswordFormProps = { token: string | null };

function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error: authError } = await authClient.resetPassword({
        token,
        newPassword: String(form.get('newPassword') ?? ''),
      });
      if (authError) {
        setError(formatAuthError(authError.code));
        return;
      }
      setDone(true);
    } catch {
      setError(formatAuthError(undefined));
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Link inválido</h1>
        <p className="text-sm text-muted-foreground">
          Solicite um novo link de recuperação de senha.
        </p>
        <Link
          href="/recuperar-senha"
          className="text-sm font-medium text-primary hover:underline"
        >
          Recuperar senha
        </Link>
      </section>
    );
  }

  if (done) {
    return (
      <section className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold">Senha alterada</h1>
        <p className="text-sm text-muted-foreground">
          Sua senha foi atualizada. Faça login com a nova senha.
        </p>
        <Button onClick={() => router.push('/entrar')}>Ir para o login</Button>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="font-heading text-2xl font-bold">Nova senha</h1>
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label
        htmlFor="reset-password"
        className="flex flex-col gap-1.5 text-sm font-medium"
      >
        Nova senha
        <Input
          id="reset-password"
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  );
}

export { ResetPasswordForm };
