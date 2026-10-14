import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
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

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ LoginForm } = await import('./login-form'));
});
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
  refresh.mockReset();
});
afterAll(() => server.close());

let LoginForm: typeof import('./login-form').LoginForm;

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Senha'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginForm', () => {
  it('loga com sucesso e navega para a home', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json({ token: 'tok', user: { email: 'maria@test.dev' } }),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-segura-1');

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/');
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra mensagem pt-BR quando as credenciais são inválidas', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json(
          {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
            status: 401,
          },
          { status: 401 },
        ),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-errada-9');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ou senha inválidos.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('orienta a confirmar o e-mail quando ainda não verificado', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-in\/email$/, () =>
        HttpResponse.json(
          {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Email not verified',
            status: 403,
          },
          { status: 403 },
        ),
      ),
    );

    render(<LoginForm />);
    fillAndSubmit('maria@test.dev', 'senha-segura-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ainda não confirmado. Verifique sua caixa de entrada.',
    );
  });
});
