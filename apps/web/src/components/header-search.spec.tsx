import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderSearch } from './header-search';

const { replace, navigation } = vi.hoisted(() => ({
  replace: vi.fn(),
  navigation: { search: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

describe('HeaderSearch', () => {
  beforeEach(() => {
    replace.mockReset();
    navigation.search = '';
  });

  it('navigates to the search URL on submit', () => {
    render(<HeaderSearch />);

    const input = screen.getByRole('searchbox', { name: 'Buscar eventos' });
    fireEvent.change(input, { target: { value: '  cyberpunk ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(replace).toHaveBeenCalledWith('/?q=cyberpunk');
  });

  it('clears the query when the field is emptied', () => {
    render(<HeaderSearch />);

    const input = screen.getByRole('searchbox', { name: 'Buscar eventos' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(replace).toHaveBeenCalledWith('/');
  });

  it('reflects a query removed externally', () => {
    navigation.search = 'q=cyberpunk';
    const { rerender } = render(<HeaderSearch />);

    const input = screen.getByRole('searchbox', {
      name: 'Buscar eventos',
    }) as HTMLInputElement;
    expect(input.value).toBe('cyberpunk');

    navigation.search = '';
    rerender(<HeaderSearch />);

    expect(input.value).toBe('');
  });
});
