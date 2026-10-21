import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const server = setupServer();

server.listen({ onUnhandledRequest: 'error' });

// better-auth's createAuthClient() captures globalThis.fetch at import time,
// so the component module must load after MSW starts patching fetch.
const { AuthMenu } = await import('./auth-menu');

afterEach(() => {
  server.resetHandlers();
  push.mockReset();
  refresh.mockReset();
});
afterAll(() => server.close());

describe('AuthMenu', () => {
  // nanostores keeps a store mounted for STORE_UNMOUNT_DELAY (1s) after its
  // last subscriber leaves; waiting past it lets each test trigger a fresh
  // session fetch on mount instead of reusing the previous test's atom.
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });

  it('mostra o link Entrar quando não há sessão', async () => {
    server.use(
      http.get(/\/api\/auth\/get-session$/, () =>
        HttpResponse.json(null, { status: 401 }),
      ),
    );

    render(<AuthMenu />);

    const link = await screen.findByRole('link', { name: /Entrar/ });
    expect(link).toHaveAttribute('href', '/entrar');
  });

  it('mostra o nome do usuário, o link Minha conta e o botão Sair quando há sessão', async () => {
    server.use(
      http.get(/\/api\/auth\/get-session$/, () =>
        HttpResponse.json({
          session: { token: 'abc' },
          user: { id: 'u1', name: 'Maria Silva', email: 'maria@test.dev' },
        }),
      ),
    );

    render(<AuthMenu />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Minha conta' })).toHaveAttribute(
      'href',
      '/conta',
    );
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
