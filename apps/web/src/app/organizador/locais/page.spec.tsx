import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { organizerVenueCreateSchema } from '@ticketvibe/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const LocaisPage = (await import('./page')).default;

const server = setupServer();

const audioClub = {
  id: '4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e4e',
  slug: 'audio-club',
  name: 'Audio Club',
  city: 'São Paulo',
  state: 'SP',
};

const casaDoSertanejo = {
  id: '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e',
  slug: 'casa-do-sertanejo',
  name: 'Casa do Sertanejo',
  city: 'Goiânia',
  state: 'GO',
};

const venueCriado = {
  ...casaDoSertanejo,
  slug: 'casa-do-sertanejo-goiania',
  name: 'Casa do Sertanejo',
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => server.close());

async function renderListaComLocais() {
  server.use(
    http.get(/\/api\/organizer\/venues$/, () =>
      HttpResponse.json({ venues: [audioClub] }),
    ),
  );

  render(<LocaisPage />);

  await screen.findByText('Audio Club');
}

function preencherFormularioDeCriacao() {
  fireEvent.change(screen.getByLabelText('Nome'), {
    target: { value: 'Casa do Sertanejo' },
  });
  fireEvent.change(screen.getByLabelText('Cidade'), {
    target: { value: 'Goiânia' },
  });
  fireEvent.change(screen.getByLabelText('Estado'), {
    target: { value: 'go' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar local' }));
}

describe('página Locais', () => {
  it('lista os locais com nome e cidade/UF', async () => {
    server.use(
      http.get(/\/api\/organizer\/venues$/, () =>
        HttpResponse.json({ venues: [audioClub, casaDoSertanejo] }),
      ),
    );

    render(<LocaisPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Locais' }),
    ).toBeInTheDocument();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);

    const rowAudioClub = rows[0];
    expect(within(rowAudioClub).getByText('Audio Club')).toBeInTheDocument();
    expect(within(rowAudioClub).getByText('São Paulo/SP')).toBeInTheDocument();

    const rowCasa = rows[1];
    expect(within(rowCasa).getByText('Casa do Sertanejo')).toBeInTheDocument();
    expect(within(rowCasa).getByText('Goiânia/GO')).toBeInTheDocument();
  });

  it('mostra o estado vazio', async () => {
    server.use(
      http.get(/\/api\/organizer\/venues$/, () =>
        HttpResponse.json({ venues: [] }),
      ),
    );

    render(<LocaisPage />);

    expect(
      await screen.findByText('Nenhum local cadastrado ainda.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadastrar local' }),
    ).toBeInTheDocument();
  });

  it('mostra a mensagem de erro quando a listagem falha', async () => {
    server.use(
      http.get(/\/api\/organizer\/venues$/, () =>
        HttpResponse.json({ error: 'upstream_error' }, { status: 502 }),
      ),
    );

    render(<LocaisPage />);

    expect(
      await screen.findByText('Não foi possível carregar os locais.'),
    ).toBeInTheDocument();
  });

  it('revela o formulário de criação apenas ao clicar em Cadastrar local', async () => {
    await renderListaComLocais();

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cidade')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar local' }));

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadastrar local' }),
    ).toBeInTheDocument();
  });

  it('cadastra o local e adiciona à lista com estado normalizado', async () => {
    let received: unknown;
    server.use(
      http.post(/\/api\/organizer\/venues$/, async (info) => {
        received = await info.request.json();
        return HttpResponse.json({ venue: venueCriado }, { status: 201 });
      }),
    );

    await renderListaComLocais();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar local' }));
    await screen.findByLabelText('Nome');
    preencherFormularioDeCriacao();

    await screen.findByText('Casa do Sertanejo');

    const parsed = organizerVenueCreateSchema.parse(received);
    expect(parsed.name).toBe('Casa do Sertanejo');
    expect(parsed.city).toBe('Goiânia');
    expect(parsed.state).toBe('GO');

    expect(screen.getByText('Goiânia/GO')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadastrar local' }),
    ).toBeInTheDocument();
  });

  it('mostra o erro de validação do upstream ao cadastrar', async () => {
    server.use(
      http.post(/\/api\/organizer\/venues$/, () =>
        HttpResponse.json({ error: 'invalid_body' }, { status: 400 }),
      ),
    );

    await renderListaComLocais();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar local' }));
    await screen.findByLabelText('Nome');
    preencherFormularioDeCriacao();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verifique os dados informados e tente novamente.',
    );
    expect(screen.queryByText('Casa do Sertanejo')).not.toBeInTheDocument();
  });

  it('edita o local em linha e reflete na lista', async () => {
    let received: unknown;
    let patchUrl = '';
    server.use(
      http.patch(
        new RegExp(`/api/organizer/venues/${audioClub.id}$`),
        async (info) => {
          patchUrl = info.request.url;
          received = await info.request.json();
          return HttpResponse.json({
            venue: {
              ...audioClub,
              name: 'Audio Club Premium',
              city: 'Campinas',
              state: 'SP',
            },
          });
        },
      ),
    );

    await renderListaComLocais();

    const rows = await screen.findAllByRole('listitem');
    const rowAudioClub = rows.find((row) =>
      within(row).queryByText('Audio Club'),
    );
    expect(rowAudioClub).toBeDefined();
    fireEvent.click(
      within(rowAudioClub as HTMLElement).getByRole('button', {
        name: 'Editar',
      }),
    );

    expect(await screen.findByLabelText('Nome')).toHaveValue('Audio Club');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('Estado')).toHaveValue('SP');

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Audio Club Premium' },
    });
    fireEvent.change(screen.getByLabelText('Cidade'), {
      target: { value: 'Campinas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Audio Club Premium');

    expect(patchUrl).toContain(`/api/organizer/venues/${audioClub.id}`);
    const parsed = organizerVenueCreateSchema.parse(received);
    expect(parsed.name).toBe('Audio Club Premium');
    expect(parsed.city).toBe('Campinas');
    expect(parsed.state).toBe('SP');

    expect(screen.getByText('Campinas/SP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('mostra o erro quando a edição falha com local não encontrado', async () => {
    server.use(
      http.patch(new RegExp(`/api/organizer/venues/${audioClub.id}$`), () =>
        HttpResponse.json({ error: 'venue_not_found' }, { status: 404 }),
      ),
    );

    await renderListaComLocais();

    const rows = await screen.findAllByRole('listitem');
    const rowAudioClub = rows.find((row) =>
      within(row).queryByText('Audio Club'),
    );
    fireEvent.click(
      within(rowAudioClub as HTMLElement).getByRole('button', {
        name: 'Editar',
      }),
    );

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local não encontrado.',
    );
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('cancela a edição e volta para a exibição da linha', async () => {
    await renderListaComLocais();

    const rows = await screen.findAllByRole('listitem');
    const rowAudioClub = rows.find((row) =>
      within(row).queryByText('Audio Club'),
    );
    fireEvent.click(
      within(rowAudioClub as HTMLElement).getByRole('button', {
        name: 'Editar',
      }),
    );

    await screen.findByLabelText('Nome');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });
});
