import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const server = setupServer();

let SignupForm: typeof import('./signup-form').SignupForm;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ SignupForm } = await import('./signup-form'));
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

describe('SignupForm', () => {
  it('cria a conta e mostra o aviso de confirmação por e-mail', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/sign-up\/email$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({
          token: null,
          user: { email: 'novo@test.dev' },
        });
      }),
    );

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Novo Usuário' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo@test.dev' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha-segura-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByRole('heading', { name: 'Verifique seu e-mail' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/novo@test\.dev/)).toBeInTheDocument();
    expect(received).toEqual({
      name: 'Novo Usuário',
      email: 'novo@test.dev',
      password: 'senha-segura-1',
    });
  });

  it('mostra erro pt-BR quando a senha é curta', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-up\/email$/, () =>
        HttpResponse.json(
          {
            code: 'PASSWORD_TOO_SHORT',
            message: 'Password too short',
            status: 400,
          },
          { status: 400 },
        ),
      ),
    );

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Novo Usuário' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo@test.dev' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'curta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A senha deve ter pelo menos 8 caracteres.',
    );
  });

  it('mostra mensagem genérica quando a rede falha', async () => {
    server.use(
      http.post(/\/api\/auth\/sign-up\/email$/, () => HttpResponse.error()),
    );

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Novo Usuário' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'novo@test.dev' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha-segura-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível continuar. Tente novamente.',
    );
  });
});
