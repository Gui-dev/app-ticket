import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EventCardProps } from '@/components/event-card';
import { EventsSection } from '@/components/home/events-section';

const cards: EventCardProps[] = [
  {
    category: 'Festival',
    title: 'Rock Fest 2026',
    date: '15 de Novembro, 2026',
    venue: 'Autódromo de Interlagos, SP',
    price: 'R$ 350,00',
  },
  {
    category: 'Show',
    title: 'Turnê Acústica',
    date: '2 de Dezembro, 2026',
    venue: 'Espaço das Artes, RJ',
    price: 'R$ 220,00',
  },
];

let scrollBySpy: ReturnType<typeof vi.spyOn>;

describe('EventsSection', () => {
  beforeEach(() => {
    Element.prototype.scrollBy = () => {};
    scrollBySpy = vi
      .spyOn(Element.prototype, 'scrollBy')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the heading and subtitle', () => {
    render(<EventsSection cards={cards} />);

    expect(
      screen.getByRole('heading', { name: 'Eventos em Alta' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Os ingressos mais procurados nas últimas 24 horas'),
    ).toBeInTheDocument();
  });

  test('scrolls the row by 344px in each direction when arrows are clicked', () => {
    render(<EventsSection cards={cards} />);

    expect(
      screen.getByRole('heading', { name: 'Rock Fest 2026' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Rolar para a direita' }),
    );
    expect(scrollBySpy).toHaveBeenCalledWith({
      left: 344,
      behavior: 'smooth',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Rolar para a esquerda' }),
    );
    expect(scrollBySpy).toHaveBeenCalledWith({
      left: -344,
      behavior: 'smooth',
    });
  });

  test('shows an empty message without arrows when there are no cards', () => {
    render(<EventsSection cards={[]} />);

    expect(
      screen.getByText('Nenhum evento em alta no momento.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rolar para a direita' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rolar para a esquerda' }),
    ).not.toBeInTheDocument();
  });
});
