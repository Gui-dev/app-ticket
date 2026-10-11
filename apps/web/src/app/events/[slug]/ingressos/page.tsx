import Link from 'next/link';

import { Header } from '@/components/header';

export default function IngressosPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-heading text-3xl font-bold">
          Escolha de ingressos
        </h1>
        <p className="text-muted-foreground">
          O mapa de assentos e a escolha de setor chegam na fase de compra.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          Voltar para a home
        </Link>
      </main>
    </>
  );
}
