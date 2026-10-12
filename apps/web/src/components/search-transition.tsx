'use client';

import type { TransitionStartFunction } from 'react';
import {
  createContext,
  type ReactNode,
  use,
  useMemo,
  useTransition,
} from 'react';
import { PageSkeleton } from './home/page-skeleton';

export interface SearchTransitionApi {
  isPending: boolean;
  startTransition: TransitionStartFunction;
}

const immediateTransition: TransitionStartFunction = (action) => {
  void action();
};

export const SearchTransitionContext = createContext<SearchTransitionApi>({
  isPending: false,
  startTransition: immediateTransition,
});

export function SearchTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const value = useMemo<SearchTransitionApi>(
    () => ({ isPending, startTransition }),
    [isPending],
  );

  return (
    <SearchTransitionContext.Provider value={value}>
      {children}
    </SearchTransitionContext.Provider>
  );
}

export function useSearchTransition(): SearchTransitionApi {
  return use(SearchTransitionContext);
}

export function ResultsRegion({ children }: { children: ReactNode }) {
  const { isPending } = useSearchTransition();
  if (isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando resultados…</span>
        <PageSkeleton />
      </div>
    );
  }
  return <>{children}</>;
}
