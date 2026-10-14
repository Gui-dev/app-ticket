import { fireEvent, render, screen } from '@testing-library/react';
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

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const server = setupServer();

let ResetPasswordForm: typeof import('./reset-password-form').ResetPasswordForm;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  ({ ResetPasswordForm } = await import('./reset-password-form'));
});
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});
afterAll(() => server.close());

describe('ResetPasswordForm', () => {
  it('redefina a senha e mostra confirmação', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/auth\/reset-password$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ status: true });
      }),
    );

    render(<ResetPasswordForm token="tok-123" />);
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-nova-456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(
      await screen.findByRole('heading', { name: 'Senha alterada' }),
    ).toBeInTheDocument();
    expect(received).toEqual({
      token: 'tok-123',
      newPassword: 'senha-nova-456',
    });
  });

  it('sem token mostra aviso de link inválido', () => {
    render(<ResetPasswordForm token={null} />);

    expect(screen.getByText(/Solicite um novo link/)).toBeInTheDocument();
  });

  it('mostra alerta quando o token é inválido (400)', async () => {
    server.use(
      http.post(/\/api\/auth\/reset-password$/, () =>
        HttpResponse.json(
          {
            code: 'INVALID_TOKEN',
            message: 'Invalid token',
            status: 400,
          },
          { status: 400 },
        ),
      ),
    );

    render(<ResetPasswordForm token="token-velho" />);
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-nova-456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Link expirado ou inválido. Solicite um novo.',
    );
  });
});
