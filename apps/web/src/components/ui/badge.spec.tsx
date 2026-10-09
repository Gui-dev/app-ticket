import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Badge } from '@/components/ui/badge';

test('renders badge text', () => {
  render(<Badge>TicketVibe</Badge>);

  expect(screen.getByText('TicketVibe')).toBeInTheDocument();
});
