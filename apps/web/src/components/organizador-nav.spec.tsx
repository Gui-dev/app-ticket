import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ current: '/organizador' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

import { OrganizerNav } from './organizador-nav';

describe('OrganizerNav', () => {
  afterEach(() => {
    pathname.current = '/organizador';
  });

  it('renderiza navegação com rótulo acessível e destaca o link Painel em /organizador', () => {
    render(<OrganizerNav />);

    expect(
      screen.getByRole('navigation', { name: 'Navegação do organizador' }),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Painel' });
    expect(link).toHaveAttribute('href', '/organizador');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('renderiza o link Relatórios apontando para /organizador/relatorios e o destaca na rota', () => {
    pathname.current = '/organizador/relatorios';

    render(<OrganizerNav />);

    const link = screen.getByRole('link', { name: 'Relatórios' });
    expect(link).toHaveAttribute('href', '/organizador/relatorios');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('renderiza o link Validação apontando para /organizador/validacao e o destaca na rota', () => {
    pathname.current = '/organizador/validacao';

    render(<OrganizerNav />);

    const link = screen.getByRole('link', { name: 'Validação' });
    expect(link).toHaveAttribute('href', '/organizador/validacao');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('renderiza o link Repasses apontando para /organizador/repasses e o destaca na rota', () => {
    pathname.current = '/organizador/repasses';

    render(<OrganizerNav />);

    const link = screen.getByRole('link', { name: 'Repasses' });
    expect(link).toHaveAttribute('href', '/organizador/repasses');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('não destaca o link Painel em outra rota', () => {
    pathname.current = '/organizador/ingressos';

    render(<OrganizerNav />);

    const link = screen.getByRole('link', { name: 'Painel' });
    expect(link).toHaveAttribute('href', '/organizador');
    expect(link).not.toHaveAttribute('aria-current');
  });
});
