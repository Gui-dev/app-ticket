import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Drama, LayoutGrid, Mic, Music } from 'lucide-react';
import { Chip } from './chip';

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    label: { control: 'text' },
    selected: { control: 'boolean' },
    icon: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  args: { label: 'Shows', selected: true },
};

export const Unselected: Story = {
  args: { label: 'Teatro' },
};

export const CategoryRow: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 bg-background p-4">
      <Chip icon={LayoutGrid} label="Todos" selected />
      <Chip icon={Music} label="Shows" />
      <Chip icon={Drama} label="Teatro" />
      <Chip icon={Mic} label="Stand-up" />
    </div>
  ),
};
