import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const EventosPage = (await import('./page')).default;

const server = setupServer();

const eventoDaPlataforma = {
  id: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e',
  slug: 'rock-night',
  title: 'Rock Night',
  description: 'Uma noite de rock com bandas convidadas.',
  category: { slug: 'shows', name: 'Shows' },
  venue: {
    slug: 'audio-club',
    name: 'Audio Club',
    city: 'São Paulo',
    state: 'SP',
  },
  startsAt: '2026-11-20T23:00:00.000Z',
  priceFromCents: 8000,
  platform: true,
};

const eventoDoOrganizador = {
  ...eventoDaPlataforma,
  id: '2e2e2e2e-2e2e-4e2e-8e2e-2e2e2e2e2e2e',
  slug: 'festa-do-livro',
  title: 'Festa do Livro',
  platform: false,
};

describe('página Meus eventos', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('mostra os cards com título, data e venue, e o chip Da plataforma apenas nos eventos da plataforma', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({
          events: [eventoDaPlataforma, eventoDoOrganizador],
        }),
      ),
    );

    render(<EventosPage />);

    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);

    const cardDaPlataforma = cards[0];
    expect(
      within(cardDaPlataforma).getByText('Rock Night'),
    ).toBeInTheDocument();
    expect(
      within(cardDaPlataforma).getByText(
        '20 de Novembro, 2026 · Audio Club · São Paulo/SP',
      ),
    ).toBeInTheDocument();
    expect(
      within(cardDaPlataforma).getByText('Da plataforma'),
    ).toBeInTheDocument();

    const cardDoOrganizador = cards[1];
    expect(
      within(cardDoOrganizador).getByRole('link', { name: 'Festa do Livro' }),
    ).toHaveAttribute('href', `/organizador/eventos/${eventoDoOrganizador.id}`);
    expect(
      within(cardDoOrganizador).queryByText('Da plataforma'),
    ).not.toBeInTheDocument();
    expect(
      within(cardDaPlataforma).queryByRole('link', { name: 'Rock Night' }),
    ).not.toBeInTheDocument();
  });

  it('mostra o estado vazio com o atalho Criar evento', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ events: [] }),
      ),
    );

    render(<EventosPage />);

    expect(
      await screen.findByText('Nenhum evento cadastrado ainda.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar evento' })).toHaveAttribute(
      'href',
      '/organizador/eventos/novo',
    );
  });

  it('mostra a mensagem de erro quando a listagem falha', async () => {
    server.use(
      http.get(/\/api\/organizer\/events$/, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<EventosPage />);

    expect(
      await screen.findByText('Não foi possível carregar seus eventos.'),
    ).toBeInTheDocument();
  });
});
