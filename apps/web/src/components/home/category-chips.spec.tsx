import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryChips } from './category-chips';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const categories = [
  { slug: 'shows', name: 'Shows' },
  { slug: 'teatro', name: 'Teatro' },
];

describe('CategoryChips', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('marks the selected category chip as pressed', () => {
    render(
      <CategoryChips
        categories={categories}
        filters={{ category: 'teatro' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Teatro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Shows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('navigates with the chosen category on click', () => {
    render(<CategoryChips categories={categories} filters={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    expect(replace).toHaveBeenCalledWith('/?category=shows');
  });

  it('toggles the category off when it is already selected', () => {
    render(
      <CategoryChips categories={categories} filters={{ category: 'shows' }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shows' }));

    expect(replace).toHaveBeenCalledWith('/');
  });
});
