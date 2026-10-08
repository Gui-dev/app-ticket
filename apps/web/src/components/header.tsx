import { ChevronDown, Heart, MapPin, Ticket, User } from 'lucide-react';
import { Button } from './ui/button';
import { SearchInput } from './ui/search-input';

type HeaderProps = {
  location?: string;
  searchPlaceholder?: string;
};

function Header({
  location = 'São Paulo, SP',
  searchPlaceholder = 'Buscar shows, teatro, comédia, cidade.',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-header">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center gap-4 px-4 lg:gap-6 lg:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-gradient">
            <Ticket
              className="size-6 text-primary-foreground"
              aria-hidden="true"
            />
          </span>
          <span className="font-heading text-xl font-bold tracking-tight">
            <span className="text-foreground">TICKET</span>
            <span className="text-primary">VIBE</span>
          </span>
        </a>
        <SearchInput
          wrapperClassName="hidden max-w-md flex-1 md:flex"
          placeholder={searchPlaceholder}
        />
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MapPin
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{location}</span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          <Button variant="outline" size="icon" aria-label="Favoritos">
            <Heart className="size-5" />
          </Button>
          <Button variant="default">
            <User className="size-4" aria-hidden="true" />
            Entrar
          </Button>
        </div>
      </div>
    </header>
  );
}

export { Header };
