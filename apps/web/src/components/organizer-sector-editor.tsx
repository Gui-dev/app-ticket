'use client';

import type {
  OrganizerEventDetailDto,
  OrganizerLotDto,
  OrganizerSeatRowDto,
  OrganizerSectorDto,
} from '@ticketvibe/shared';
import { type FormEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBRL } from '@/lib/format';
import {
  createOrganizerLot,
  createOrganizerRow,
  createOrganizerSector,
  deleteOrganizerLot,
  deleteOrganizerRow,
} from '@/lib/organizer-api';

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

const periodFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

type NovaFila = {
  id: number;
  label: string;
  seatCount: string;
};

type OrganizerSectorEditorProps = {
  event: OrganizerEventDetailDto;
  onChanged: () => void;
};

function formatVigencia(startsAt: string, endsAt: string): string {
  return `${periodFormatter.format(new Date(startsAt))} – ${periodFormatter.format(new Date(endsAt))}`;
}

function toCents(value: FormDataEntryValue | null): number {
  return Math.round(Number(value ?? '0') * 100);
}

function OrganizerSectorEditor({
  event,
  onChanged,
}: OrganizerSectorEditorProps) {
  const novaFilaId = useRef(0);
  const [novasFilas, setNovasFilas] = useState<NovaFila[]>([
    { id: novaFilaId.current, label: '', seatCount: '' },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function criarFila(): NovaFila {
    novaFilaId.current += 1;
    return { id: novaFilaId.current, label: '', seatCount: '' };
  }

  function resetaFilas() {
    setNovasFilas(([first]) => [{ id: first.id, label: '', seatCount: '' }]);
  }

  async function criarSetor(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const formElement = formEvent.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    try {
      await createOrganizerSector(event.id, {
        name: String(form.get('name') ?? '').trim(),
        priceFromCents: toCents(form.get('price')),
        rows: novasFilas.map((fila) => ({
          label: fila.label.trim(),
          seatCount: Number(fila.seatCount),
        })),
      });
      formElement.reset();
      resetaFilas();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function adicionarFila(
    formEvent: FormEvent<HTMLFormElement>,
    sector: OrganizerSectorDto,
  ) {
    formEvent.preventDefault();
    const formElement = formEvent.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    try {
      await createOrganizerRow(sector.id, {
        label: String(form.get('filaLabel') ?? '').trim(),
        seatCount: Number(form.get('filaSeats') ?? '0'),
      });
      formElement.reset();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function removerFila(row: OrganizerSeatRowDto) {
    setPending(true);
    setError(null);
    try {
      await deleteOrganizerRow(row.id);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function criarLote(
    formEvent: FormEvent<HTMLFormElement>,
    sector: OrganizerSectorDto,
  ) {
    formEvent.preventDefault();
    const formElement = formEvent.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    try {
      await createOrganizerLot(sector.id, {
        name: String(form.get('loteName') ?? '').trim(),
        priceCents: toCents(form.get('lotePrice')),
        startsAt: new Date(
          String(form.get('loteStartsAt') ?? ''),
        ).toISOString(),
        endsAt: new Date(String(form.get('loteEndsAt') ?? '')).toISOString(),
      });
      formElement.reset();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function removerLote(lot: OrganizerLotDto) {
    setPending(true);
    setError(null);
    try {
      await deleteOrganizerLot(lot.id);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : GENERIC_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {event.sectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum setor cadastrado ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {event.sectors.map((sector) => (
            <li
              key={sector.id}
              aria-label={sector.name}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {sector.name}
                </h3>
                <span className="text-sm font-medium text-foreground">
                  {formatBRL(sector.priceFromCents)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {`${sector.seatsTotal} lugares`}
              </p>

              <ul className="flex flex-col gap-2 text-sm">
                {sector.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-foreground">{`Fila ${row.label} · ${row.seatCount} lugares`}</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      aria-label={`Excluir fila ${row.label}`}
                      disabled={pending}
                      onClick={() => void removerFila(row)}
                    >
                      Excluir
                    </Button>
                  </li>
                ))}
              </ul>

              <form
                aria-label={`Adicionar fila — ${sector.name}`}
                onSubmit={(formEvent) => void adicionarFila(formEvent, sector)}
                className="flex flex-wrap items-end justify-between gap-2"
              >
                <label
                  htmlFor={`fila-${sector.id}-label`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  Nome da fila
                  <Input
                    id={`fila-${sector.id}-label`}
                    type="text"
                    name="filaLabel"
                    required
                    className="w-24"
                  />
                </label>
                <label
                  htmlFor={`fila-${sector.id}-lugares`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  Lugares
                  <Input
                    id={`fila-${sector.id}-lugares`}
                    type="number"
                    name="filaSeats"
                    required
                    min="1"
                    max="200"
                    className="w-20"
                  />
                </label>
                <Button type="submit" size="sm" disabled={pending}>
                  Adicionar fila
                </Button>
              </form>

              {sector.lots.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum lote cadastrado.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {sector.lots.map((lot) => (
                    <li
                      key={lot.id}
                      aria-label={`Lote ${lot.name}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-foreground">{lot.name}</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatBRL(lot.priceCents)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {`Vigência ${formatVigencia(lot.startsAt, lot.endsAt)}`}
                      </span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label={`Excluir lote ${lot.name}`}
                        disabled={pending}
                        onClick={() => void removerLote(lot)}
                      >
                        Excluir
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                aria-label={`Criar lote — ${sector.name}`}
                onSubmit={(formEvent) => void criarLote(formEvent, sector)}
                className="flex flex-col gap-3 border-t border-border pt-4"
              >
                <h4 className="text-sm font-semibold text-foreground">
                  Criar lote
                </h4>
                <label
                  htmlFor={`lote-${sector.id}-name`}
                  className="flex flex-col gap-1.5 text-sm font-medium"
                >
                  Nome do lote
                  <Input
                    id={`lote-${sector.id}-name`}
                    type="text"
                    name="loteName"
                    required
                  />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label
                    htmlFor={`lote-${sector.id}-price`}
                    className="flex flex-col gap-1.5 text-sm font-medium"
                  >
                    Preço
                    <Input
                      id={`lote-${sector.id}-price`}
                      type="number"
                      name="lotePrice"
                      required
                      min="0"
                      step="0.01"
                      className="w-28"
                    />
                  </label>
                  <label
                    htmlFor={`lote-${sector.id}-starts`}
                    className="flex flex-col gap-1.5 text-sm font-medium"
                  >
                    Início da venda
                    <Input
                      id={`lote-${sector.id}-starts`}
                      type="datetime-local"
                      name="loteStartsAt"
                      required
                    />
                  </label>
                  <label
                    htmlFor={`lote-${sector.id}-ends`}
                    className="flex flex-col gap-1.5 text-sm font-medium"
                  >
                    Fim da venda
                    <Input
                      id={`lote-${sector.id}-ends`}
                      type="datetime-local"
                      name="loteEndsAt"
                      required
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={pending}>
                    Criar lote
                  </Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section
        aria-label="Criar setor"
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Criar setor
        </h2>
        <form
          onSubmit={(formEvent) => void criarSetor(formEvent)}
          className="flex flex-col gap-3"
        >
          <label
            htmlFor="criar-setor-nome"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Nome do setor
            <Input id="criar-setor-nome" type="text" name="name" required />
          </label>
          <label
            htmlFor="criar-setor-preco"
            className="flex flex-col gap-1.5 text-sm font-medium"
          >
            Preço base
            <Input
              id="criar-setor-preco"
              type="number"
              name="price"
              required
              min="0"
              step="0.01"
            />
          </label>
          <p className="text-xs text-muted-foreground">Filas</p>
          <ul className="flex flex-col gap-2">
            {novasFilas.map((fila, index) => (
              <li key={fila.id} className="flex flex-wrap items-end gap-2">
                <label
                  htmlFor={`nova-fila-${fila.id}`}
                  className="flex flex-col gap-1.5 text-sm font-medium"
                >
                  Nome da fila
                  <Input
                    id={`nova-fila-${fila.id}`}
                    type="text"
                    value={fila.label}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setNovasFilas((filas) =>
                        filas.map((item, i) =>
                          i === index ? { ...item, label: value } : item,
                        ),
                      );
                    }}
                    required
                    className="w-24"
                  />
                </label>
                <label
                  htmlFor={`nova-fila-lugares-${fila.id}`}
                  className="flex flex-col gap-1.5 text-sm font-medium"
                >
                  Lugares
                  <Input
                    id={`nova-fila-lugares-${fila.id}`}
                    type="number"
                    min="1"
                    max="200"
                    value={fila.seatCount}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setNovasFilas((filas) =>
                        filas.map((item, i) =>
                          i === index ? { ...item, seatCount: value } : item,
                        ),
                      );
                    }}
                    required
                    className="w-20"
                  />
                </label>
                {novasFilas.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover fila ${index + 1}`}
                    onClick={() =>
                      setNovasFilas((filas) =>
                        filas.filter((item) => item.id !== fila.id),
                      )
                    }
                  >
                    Remover
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setNovasFilas((filas) => [...filas, criarFila()])}
          >
            Adicionar fila
          </Button>
          <Button type="submit" disabled={pending}>
            Criar setor
          </Button>
        </form>
      </section>
    </section>
  );
}

export { OrganizerSectorEditor };
