import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  ResultsRegion,
  SearchTransitionProvider,
  useSearchTransition,
} from './search-transition';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Probe({
  gate,
  onPending,
  children,
}: {
  gate: { promise: Promise<void> };
  onPending?: (isPending: boolean) => void;
  children?: ReactNode;
}) {
  const { isPending, startTransition } = useSearchTransition();
  const [phase, setPhase] = useState('idle');
  onPending?.(isPending);

  return (
    <div>
      <span data-testid="pending">{String(isPending)}</span>
      <span data-testid="phase">{phase}</span>
      <button
        type="button"
        onClick={() => {
          startTransition(async () => {
            setPhase('running');
            await gate.promise;
            setPhase('done');
          });
        }}
      >
        search
      </button>
      {children}
    </div>
  );
}

function skeletonPulses(container: HTMLElement) {
  return container.querySelectorAll('.animate-pulse');
}

describe('SearchTransitionProvider', () => {
  it('shares isPending with consumers', async () => {
    const gate = deferred();
    const observed: boolean[] = [];

    render(
      <SearchTransitionProvider>
        <Probe gate={gate} onPending={(p) => observed.push(p)} />
      </SearchTransitionProvider>,
    );

    expect(screen.getByTestId('pending')).toHaveTextContent('false');
    expect(screen.getByTestId('phase')).toHaveTextContent('idle');

    fireEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(screen.getByTestId('pending')).toHaveTextContent('true');
    expect(observed).toContain(true);

    await act(async () => {
      gate.resolve();
    });

    expect(screen.getByTestId('pending')).toHaveTextContent('false');
    expect(screen.getByTestId('phase')).toHaveTextContent('done');
    expect(observed.at(-1)).toBe(false);
  });

  it('falls back to a non-pending default without a provider', () => {
    let snapshot!: ReturnType<typeof useSearchTransition>;

    function Bare() {
      snapshot = useSearchTransition();
      return <span>{String(snapshot.isPending)}</span>;
    }

    render(<Bare />);

    expect(screen.getByText('false')).toBeInTheDocument();
    expect(() => snapshot.startTransition(() => {})).not.toThrow();
    expect(snapshot.isPending).toBe(false);
  });
});

describe('ResultsRegion', () => {
  it('swaps children for the page skeleton while the transition is pending', async () => {
    const gate = deferred();
    const { container } = render(
      <SearchTransitionProvider>
        <Probe gate={gate} />
        <ResultsRegion>
          <p>results content</p>
        </ResultsRegion>
      </SearchTransitionProvider>,
    );

    expect(screen.getByText('results content')).toBeInTheDocument();
    expect(skeletonPulses(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(screen.queryByText('results content')).not.toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    const pulses = skeletonPulses(container);
    expect(pulses).toHaveLength(3);
    expect(pulses[0]).toHaveClass('min-h-[26rem]');
    expect(pulses[1]).toHaveClass('h-10');
    expect(pulses[2]).toHaveClass('h-[26rem]');

    await act(async () => {
      gate.resolve();
    });

    expect(screen.getByText('results content')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(skeletonPulses(container)).toHaveLength(0);
  });

  it('renders children without a provider', () => {
    const { container } = render(
      <ResultsRegion>
        <p>results content</p>
      </ResultsRegion>,
    );

    expect(screen.getByText('results content')).toBeInTheDocument();
    expect(skeletonPulses(container)).toHaveLength(0);
  });
});
