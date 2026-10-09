import { cn } from 'cn';
import { CalendarDays, Heart, MapPin, Ticket } from 'lucide-react';
import Image from 'next/image';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export type EventCardProps = {
  category: string;
  title: string;
  date: string;
  venue: string;
  price: string;
  badgeLabel?: string;
  imageSrc?: string;
  className?: string;
};

function EventCard({
  category,
  title,
  date,
  venue,
  price,
  badgeLabel,
  imageSrc,
  className,
}: EventCardProps) {
  return (
    <article
      className={cn(
        'w-full max-w-80 overflow-hidden rounded-xl border border-border bg-card shadow-card',
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover"
          />
        ) : (
          <div className="bg-event-gradient flex h-full w-full items-center justify-center">
            <Ticket className="size-10 text-primary/70" aria-hidden="true" />
          </div>
        )}
        {badgeLabel ? (
          <Badge className="absolute left-3 top-3">{badgeLabel}</Badge>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          aria-label={`Favoritar ${title}`}
          className="absolute right-3 top-3 bg-background/70 backdrop-blur-sm"
        >
          <Heart className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">
          {category}
        </p>
        <h3 className="font-heading text-lg font-semibold text-foreground">
          {title}
        </h3>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {date}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {venue}
        </p>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">A partir de</p>
            <p className="text-xl font-bold text-primary">{price}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          >
            Ver Ingressos
          </Button>
        </div>
      </div>
    </article>
  );
}

export { EventCard };
