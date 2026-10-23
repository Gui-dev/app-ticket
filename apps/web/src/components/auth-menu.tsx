'use client';

import { User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';

function AuthMenu() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <Button variant="default" disabled aria-label="Carregando sessão">
        <User className="size-4" aria-hidden="true" />
        Entrar
      </Button>
    );
  }

  if (!data?.user) {
    return (
      <Button variant="default" asChild>
        <Link href="/entrar">
          <User className="size-4" aria-hidden="true" />
          Entrar
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-40 truncate text-sm font-medium text-foreground sm:inline">
        {data.user.name}
      </span>
      {data.user.role === 'organizer' ? (
        <Button variant="default" asChild>
          <Link href="/organizador">Painel do organizador</Link>
        </Button>
      ) : null}
      <Button variant="default" asChild>
        <Link href="/conta">Minha conta</Link>
      </Button>
      <Button
        variant="outline"
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
      >
        Sair
      </Button>
    </div>
  );
}

export { AuthMenu };
