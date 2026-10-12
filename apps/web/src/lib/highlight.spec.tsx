import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlighted } from './highlight';

function renderHighlighted(text: string, query: string) {
  const { container } = render(
    <div data-testid="target">{highlighted(text, query)}</div>,
  );
  return {
    container,
    target: container.querySelector('[data-testid="target"]'),
  };
}

describe('highlighted', () => {
  it('wraps case-insensitive matches in mark without a background class', () => {
    const { target } = renderHighlighted('Fantasma da Ópera', 'FANTASMA');

    const marks = target?.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks?.[0].textContent).toBe('Fantasma');
    expect(marks?.[0].className).toBe('bg-transparent text-inherit');
  });

  it('highlights every whitespace-separated term', () => {
    const { target } = renderHighlighted(
      'Rock Night em São Paulo',
      'rock paulo',
    );

    const marks = [...(target?.querySelectorAll('mark') ?? [])];
    expect(marks.map((mark) => mark.textContent)).toEqual(['Rock', 'Paulo']);
  });

  it('returns the text untouched when the query is blank', () => {
    const { target } = renderHighlighted('Rock Night', '   ');

    expect(target?.querySelectorAll('mark')).toHaveLength(0);
    expect(target?.textContent).toBe('Rock Night');
  });

  it('escapes regex special characters in the query', () => {
    const { target } = renderHighlighted('C++ Brasil', 'c++');

    const marks = target?.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks?.[0].textContent).toBe('C++');
  });
});
