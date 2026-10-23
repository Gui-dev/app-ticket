import Link from 'next/link';

import { Button } from './ui/button';

function AcessoNegado() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">
        Acesso restrito
      </h1>
      <p className="text-sm text-muted-foreground">
        Somente organizadores têm acesso a esta área.
      </p>
      <Button asChild>
        <Link href="/">Voltar para a home</Link>
      </Button>
    </div>
  );
}

export { AcessoNegado };
