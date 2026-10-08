import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SearchInput } from './search-input';

const meta: Meta<typeof SearchInput> = {
  title: 'Components/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Buscar shows, teatro, comédia, cidade.',
    wrapperClassName: 'w-96',
  },
};
