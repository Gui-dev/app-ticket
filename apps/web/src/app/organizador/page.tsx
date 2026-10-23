import Link from 'next/link';

const SHORTCUTS = [
  { href: '/organizador', label: 'Painel' },
  { href: '/organizador/eventos', label: 'Meus eventos' },
  { href: '/organizador/locais', label: 'Locais' },
] as const;

export default function OrganizadorPage() {
  return (
    <>
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">
        Painel do organizador
      </h1>
      <nav aria-label="Atalhos do organizador" className="flex flex-wrap gap-2">
        {SHORTCUTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        Crie e gerencie seus eventos a partir dos atalhos acima.
      </p>
    </>
  );
}
