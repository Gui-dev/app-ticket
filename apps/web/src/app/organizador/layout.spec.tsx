import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  current: {
    data: null as {
      user: {
        id: string;
        name: string;
        email: string;
        role: 'buyer' | 'organizer';
      };
    } | null,
    isPending: false,
  },
}));

const hooks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: { current: '/organizador' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: hooks.replace }),
  usePathname: () => hooks.pathname.current,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => sessionState.current },
}));

import OrganizerLayout from './layout';

describe('OrganizerLayout', () => {
  beforeEach(() => {
    hooks.replace.mockReset();
    sessionState.current = { data: null, isPending: false };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mostra apenas o splash enquanto a sessão carrega, sem conteúdo protegido', () => {
    sessionState.current = {
      data: null,
      isPending: true,
    };

    render(
      <OrganizerLayout>
        <p>Conteúdo protegido</p>
      </OrganizerLayout>,
    );

    const splash = screen.getByRole('status');
    expect(splash).toHaveTextContent('Carregando área do organizador...');
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(hooks.replace).not.toHaveBeenCalled();
  });

  it('redireciona para /entrar e mostra o splash quando não há usuário', () => {
    render(
      <OrganizerLayout>
        <p>Conteúdo protegido</p>
      </OrganizerLayout>,
    );

    expect(hooks.replace).toHaveBeenCalledWith('/entrar');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Carregando área do organizador...',
    );
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('mostra AcessoNegado sem redirect e sem conteúdo protegido para um usuário buyer', () => {
    sessionState.current = {
      data: {
        user: {
          id: 'u1',
          name: 'Maria Silva',
          email: 'maria@test.dev',
          role: 'buyer',
        },
      },
      isPending: false,
    };

    render(
      <OrganizerLayout>
        <p>Conteúdo protegido</p>
      </OrganizerLayout>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Acesso restrito' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Somente organizadores têm acesso a esta área.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voltar para a home' }),
    ).toHaveAttribute('href', '/');
    expect(hooks.replace).not.toHaveBeenCalled();
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('renderiza a navegação do organizador e o conteúdo para um usuário organizer', () => {
    sessionState.current = {
      data: {
        user: {
          id: 'u2',
          name: 'Pedro Alves',
          email: 'pedro@test.dev',
          role: 'organizer',
        },
      },
      isPending: false,
    };

    render(
      <OrganizerLayout>
        <p>Conteúdo protegido</p>
      </OrganizerLayout>,
    );

    expect(
      screen.getByRole('navigation', { name: 'Navegação do organizador' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
    expect(hooks.replace).not.toHaveBeenCalled();
  });
});
