import type { Preview } from '@storybook/nextjs-vite';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { inter, poppins } from '../src/app/fonts';
import '../src/app/globals.css';
import { SearchTransitionProvider } from '../src/components/search-transition';

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
        <NuqsAdapter>
          <SearchTransitionProvider>
            <Story />
          </SearchTransitionProvider>
        </NuqsAdapter>
      </div>
    ),
  ],
};

export default preview;
