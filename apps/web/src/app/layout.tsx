import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';
import { SearchTransitionProvider } from '../components/search-transition';
import { inter, poppins } from './fonts';

export const metadata: Metadata = {
  title: 'TICKETVIBE',
  description: 'Marketplace de ingressos para eventos',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${poppins.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NuqsAdapter>
          <SearchTransitionProvider>{children}</SearchTransitionProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
