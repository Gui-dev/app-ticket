import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EventCard } from './event-card';

const meta: Meta<typeof EventCard> = {
  title: 'Components/EventCard',
  component: EventCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    category: 'Teatro',
    title: 'O Fantasma da Ópera',
    date: '22 de Outubro, 2026',
    venue: 'Teatro Renault',
    price: 'R$ 120,00',
    badgeLabel: 'Clássico',
  },
};
