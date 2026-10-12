import type { ReactNode } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlighted(text: string, query: string): ReactNode {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;

  const pattern = terms.map(escapeRegExp).join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  const nodes: ReactNode[] = [];

  for (const part of parts) {
    if (part === '') continue;
    if (terms.some((term) => term.toLowerCase() === part.toLowerCase())) {
      nodes.push(
        <mark
          key={`${part}:${nodes.length}`}
          className="bg-transparent text-inherit"
        >
          {part}
        </mark>,
      );
    } else {
      nodes.push(part);
    }
  }

  return nodes;
}
