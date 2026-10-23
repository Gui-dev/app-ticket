'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { AcessoNegado } from '@/components/acesso-negado';
import { OrganizerNav } from '@/components/organizador-nav';
import { authClient } from '@/lib/auth-client';

function OrganizerLayout({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  const user = data?.user;

  useEffect(() => {
    if (!isPending && !user) {
      router.replace('/entrar');
    }
  }, [isPending, user, router]);

  if (isPending || !user) {
    return (
      <p
        role="status"
        className="mx-auto w-full max-w-3xl px-4 py-16 text-sm text-muted-foreground sm:px-6 lg:px-8"
      >
        Carregando área do organizador...
      </p>
    );
  }

  if (user.role !== 'organizer') {
    return <AcessoNegado />;
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="font-heading text-2xl font-bold">Organizador</div>
        <OrganizerNav />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default OrganizerLayout;
