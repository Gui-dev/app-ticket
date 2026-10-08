import type { Preview } from '@storybook/nextjs-vite';
import { inter, poppins } from '../src/app/fonts';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'ticketvibe',
      values: [{ name: 'ticketvibe', value: '#0a0716' }],
    },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div
        className={`${inter.variable} ${poppins.variable} dark min-h-screen bg-background font-sans text-foreground`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
