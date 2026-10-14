import { fireEvent, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const server = setupServer();

let RecoverPasswordForm: typeof import('./recover-password-form').RecoverPasswordForm;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ RecoverPasswordForm } = await import('./recover-password-form'));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('RecoverPasswordForm', () => {
  it('envia o pedido e mostra mensagem anti-enumeration', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/request-password-reset$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ status: true });
      }),
    );

    render(<RecoverPasswordForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'maria@test.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText(/Se o e-mail existir/)).toBeInTheDocument();
    expect(received).toEqual({
      email: 'maria@test.dev',
      redirectTo: '/redefinir-senha',
    });
  });

  it('mostra mensagem genérica quando a rede falha', async () => {
    server.use(
      http.post(/\/api\/auth\/request-password-reset$/, () =>
        HttpResponse.error(),
      ),
    );

    render(<RecoverPasswordForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'maria@test.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível continuar. Tente novamente.',
    );
  });
});
