import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SearchFilters } from '@ticketvibe/shared';
import {
  type UrlUpdateEvent,
  withNuqsTestingAdapter,
} from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import { CategoryChips } from './category-chips';

const categories = [
  { slug: 'shows', name: 'Shows' },
  { slug: 'teatro', name: 'Teatro' },
];

function renderChips(
  filters: SearchFilters,
  searchParams = '',
  onUrlUpdate?: (event: UrlUpdateEvent) => void,
) {
  return render(<CategoryChips categories={categories} filters={filters} />, {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }),
  });
}

describe('CategoryChips', () => {
  it('marks the selected category chip as pressed', () => {
    renderChips({ category: 'teatro' }, 'category=teatro');

    expect(screen.getByRole('button', { name: 'Teatro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Shows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes the clicked category into the URL with replace', async () => {
    const onUrlUpdate = vi.fn();
    renderChips({}, '', onUrlUpdate);

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    const event = onUrlUpdate.mock.calls[0][0] as UrlUpdateEvent;
    expect(event.queryString).toContain('category=shows');
    expect(event.options.history).toBe('replace');
  });

  it('toggles the category off when it is already selected', async () => {
    const onUrlUpdate = vi.fn();
    renderChips({ category: 'shows' }, 'category=shows', onUrlUpdate);

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    const event = onUrlUpdate.mock.calls[0][0] as UrlUpdateEvent;
    expect(event.queryString).not.toContain('category=shows');
  });
});
