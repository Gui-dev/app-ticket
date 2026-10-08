import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Header } from './header';

const meta: Meta<typeof Header> = {
  title: 'Components/Header',
  component: Header,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { location: 'São Paulo, SP' },
};
