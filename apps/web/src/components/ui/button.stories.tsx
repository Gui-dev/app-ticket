import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'outline',
        'secondary',
        'ghost',
        'destructive',
        'link',
      ],
    },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: 'Garantir Ingressos' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Ver detalhes' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancelar' },
};
