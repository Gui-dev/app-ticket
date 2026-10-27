'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/organizador', label: 'Painel' },
  { href: '/organizador/relatorios', label: 'Relatórios' },
  { href: '/organizador/validacao', label: 'Validação' },
] as const;

function OrganizerNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação do organizador"
      className="flex items-center gap-2 overflow-x-auto"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
              isActive
                ? 'border-border bg-secondary text-secondary-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { OrganizerNav };
