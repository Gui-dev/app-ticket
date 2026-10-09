import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface HeroCardProps {
  badgeLabel?: string;
  categoryName: string;
  dateLabel: string;
  venueLabel: string;
  title: string;
  description: string;
  priceLabel: string;
  imageSrc?: string;
}

export function HeroCard(props: HeroCardProps): React.ReactElement {
  return (
    <section className="relative isolate min-h-[26rem] overflow-hidden rounded-2xl border border-border p-6 shadow-card sm:p-10">
      <div aria-hidden className="bg-event-gradient absolute inset-0 -z-10" />
      {props.imageSrc ? (
        <Image
          src={props.imageSrc}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 1152px"
          aria-hidden
          className="-z-10 object-cover"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/60 to-background/10"
      />
      <div className="flex min-h-[20rem] flex-col">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>EM DESTAQUE</Badge>
          <Badge variant="secondary">
            {props.badgeLabel ?? props.categoryName}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            {props.dateLabel}
          </span>
          <span aria-hidden>•</span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-primary" aria-hidden />
            {props.venueLabel}
          </span>
        </div>
        <h1 className="mt-6 font-heading text-4xl font-bold sm:text-5xl lg:text-6xl">
          {props.title}
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          {props.description}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-8">
          <Button size="lg" className="shadow-primary">
            <Ticket aria-hidden />
            Garantir Ingressos
          </Button>
          <span className="rounded-full border border-border bg-card/70 px-4 py-1.5 text-sm">
            A partir de{' '}
            <span className="font-semibold text-primary">
              {props.priceLabel}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
