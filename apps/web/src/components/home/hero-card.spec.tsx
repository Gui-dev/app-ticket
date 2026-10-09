import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { HeroCard } from '@/components/home/hero-card';

const props = {
  categoryName: 'Ópera',
  dateLabel: '22 de Outubro, 2026',
  venueLabel: 'Teatro Renault, SP',
  title: 'Noite de Ópera: Carmen',
  description: 'Uma noite inesquecível com a orquestra sinfônica convidada.',
  priceLabel: 'R$ 120,00',
};

test('renders featured pill and custom badge label when badgeLabel is given', () => {
  render(<HeroCard {...props} badgeLabel="Espetáculo Internacional" />);

  expect(screen.getByText('EM DESTAQUE')).toBeInTheDocument();
  expect(screen.getByText('Espetáculo Internacional')).toBeInTheDocument();
});

test('renders the exact title and falls back to categoryName in the pill', () => {
  render(<HeroCard {...props} />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Noite de Ópera: Carmen' }),
  ).toBeInTheDocument();
  expect(screen.getByText('EM DESTAQUE')).toBeInTheDocument();
  expect(screen.getByText('Ópera')).toBeInTheDocument();
});

test('renders date, venue and description', () => {
  render(<HeroCard {...props} />);

  expect(screen.getByText('22 de Outubro, 2026')).toBeInTheDocument();
  expect(screen.getByText('Teatro Renault, SP')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Uma noite inesquecível com a orquestra sinfônica convidada.',
    ),
  ).toBeInTheDocument();
});

test('renders price and the buy tickets button', () => {
  render(<HeroCard {...props} />);

  expect(screen.getByText('R$ 120,00').parentElement).toHaveTextContent(
    'A partir de R$ 120,00',
  );
  expect(
    screen.getByRole('button', { name: 'Garantir Ingressos' }),
  ).toBeInTheDocument();
});
