'use client';

import { ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import { useRef } from 'react';

import { EventCard, type EventCardProps } from '@/components/event-card';
import { Button } from '@/components/ui/button';

const CARD_STEP_PX = 344;

export function EventsSection({ cards }: { cards: EventCardProps[] }) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    rowRef.current?.scrollBy({
      left: direction * CARD_STEP_PX,
      behavior: 'smooth',
    });
  };

  return (
    <section
      aria-labelledby="highlights-heading"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="highlights-heading"
            className="flex items-center gap-3 font-heading text-3xl font-bold"
          >
            <Zap className="size-7 fill-primary text-primary" aria-hidden />
            Eventos em Alta
          </h2>
          <p className="mt-2 text-muted-foreground">
            Os ingressos mais procurados nas últimas 24 horas
          </p>
        </div>
        {cards.length > 0 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Rolar para a esquerda"
              onClick={() => scrollBy(-1)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Rolar para a direita"
              onClick={() => scrollBy(1)}
            >
              <ArrowRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      {cards.length > 0 ? (
        <div
          ref={rowRef}
          className="flex gap-6 overflow-x-auto pb-2 [scrollbar-width:none]"
        >
          {cards.map((card) => (
            <EventCard key={card.title} {...card} className="shrink-0" />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Nenhum evento em alta no momento.
        </p>
      )}
    </section>
  );
}
