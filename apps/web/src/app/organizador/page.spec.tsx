import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrganizadorPage from './page';

describe('página Painel do organizador', () => {
  it('mostra os atalhos do painel, incluindo o link Locais', () => {
    render(<OrganizadorPage />);

    const navigation = screen.getByRole('navigation', {
      name: 'Atalhos do organizador',
    });

    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meus eventos' })).toHaveAttribute(
      'href',
      '/organizador/eventos',
    );
    expect(screen.getByRole('link', { name: 'Locais' })).toHaveAttribute(
      'href',
      '/organizador/locais',
    );
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'href',
      '/organizador/relatorios',
    );
  });
});
