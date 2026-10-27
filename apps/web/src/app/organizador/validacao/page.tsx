'use client';

import type {
  OrganizerEventDto,
  OrganizerTicketValidationDto,
} from '@ticketvibe/shared';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { QrScanner } from '@/components/qr-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDatePtBR } from '@/lib/format';
import {
  fetchOrganizerEvents,
  fetchOrganizerTicketValidation,
} from '@/lib/organizer-api';
import { decodeQr } from '@/lib/qr-decoder';

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';
const EVENTS_FAILED_MESSAGE = 'Não foi possível carregar os eventos.';
const EVENTS_PENDING_MESSAGE = 'Carregando os eventos...';
const EMPTY_EVENTS_MESSAGE = 'Nenhum evento do organizador ainda.';
const CAMERA_FAILED_MESSAGE =
  'Não foi possível acessar a câmera. Use o código manual.';
const NO_EVENT_MESSAGE = 'Selecione um evento antes de validar.';
const VALIDATION_PENDING_MESSAGE = 'Validando ingresso…';
const VALIDATION_FAILED_MESSAGE = 'Não foi possível validar o ingresso.';

const hourFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

const ALERT_CLASS =
  'rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive';

function errorFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : GENERIC_MESSAGE;
}

function usedAtLine(validation: OrganizerTicketValidationDto): string {
  if (validation.usedAt === null) return '';
  const hour = hourFormatter.format(new Date(validation.usedAt));
  return `Utilizado em ${formatDatePtBR(validation.usedAt)} às ${hour} por ${validation.usedBy}.`;
}

function ValidacaoPage() {
  const [events, setEvents] = useState<OrganizerEventDto[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [missingEventMessage, setMissingEventMessage] = useState(false);
  const [validation, setValidation] =
    useState<OrganizerTicketValidationDto | null>(null);
  const [validationState, setValidationState] = useState<LoadState>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const validationController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const loaded = await fetchOrganizerEvents();
        if (controller.signal.aborted) return;
        setEvents(loaded);
      } catch {
        if (controller.signal.aborted) return;
        setEventsFailed(true);
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, []);

  function handleCode(code: string) {
    if (!selectedEventId) {
      setMissingEventMessage(true);
      return;
    }
    void validateTicket(code);
  }

  async function validateTicket(code: string) {
    validationController.current?.abort();
    const controller = new AbortController();
    validationController.current = controller;
    setMissingEventMessage(false);
    setValidation(null);
    setValidationError(null);
    setValidationState('loading');
    try {
      const loaded = await fetchOrganizerTicketValidation(selectedEventId, {
        code,
      });
      if (controller.signal.aborted) return;
      setValidation(loaded);
      setValidationState('loaded');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setValidation(null);
      setValidationError(errorFrom(cause));
      setValidationState('failed');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '');
    if (code) void validateTicket(code);
  }

  const organizerEvents =
    events === null ? null : events.filter((item) => !item.platform);

  return (
    <>
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">
        Validação de ingressos
      </h1>
      {eventsFailed ? (
        <p role="alert" className="text-sm text-destructive">
          {EVENTS_FAILED_MESSAGE}
        </p>
      ) : null}
      <label
        htmlFor="validacao-evento"
        className="flex w-full max-w-sm flex-col gap-1.5 text-sm font-medium"
      >
        Evento
        <select
          id="validacao-evento"
          disabled={organizerEvents === null || organizerEvents.length === 0}
          value={selectedEventId}
          onChange={(event) => setSelectedEventId(event.target.value)}
          className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="" disabled>
            Selecione um evento
          </option>
          {organizerEvents?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {events === null && !eventsFailed ? (
        <p role="status" className="text-sm text-muted-foreground">
          {EVENTS_PENDING_MESSAGE}
        </p>
      ) : organizerEvents !== null && organizerEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_EVENTS_MESSAGE}</p>
      ) : null}
      <section
        aria-label="Câmera do scanner"
        className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4"
      >
        <QrScanner
          decode={decodeQr}
          onCode={handleCode}
          onCameraError={() => setCameraFailed(true)}
        />
        {cameraFailed ? (
          <p role="status" className="text-sm text-destructive">
            {CAMERA_FAILED_MESSAGE}
          </p>
        ) : null}
      </section>
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
      >
        <label
          htmlFor="validacao-codigo"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Código do ingresso
          <Input
            id="validacao-codigo"
            type="text"
            name="code"
            className="w-auto"
          />
        </label>
        <Button type="submit" disabled={!selectedEventId}>
          Validar
        </Button>
      </form>
      {validationError !== null ? (
        <p role="alert" className={ALERT_CLASS}>
          {`${VALIDATION_FAILED_MESSAGE} ${validationError}`}
        </p>
      ) : validationState === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {VALIDATION_PENDING_MESSAGE}
        </p>
      ) : validationState === 'loaded' && validation ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4"
        >
          {validation.result === 'valid' ? (
            <p className="font-heading text-xl font-bold">Ingresso válido.</p>
          ) : null}
          {validation.result === 'invalid' ? (
            <p className="font-heading text-xl font-bold">Ingresso inválido.</p>
          ) : null}
          {validation.result === 'already_used' ? (
            <p className="font-heading text-xl font-bold">
              Ingresso já utilizado.
            </p>
          ) : null}
          {validation.sectorName !== null &&
          validation.rowLabel !== null &&
          validation.seatLabel !== null ? (
            <p className="text-sm text-muted-foreground">
              {`${validation.sectorName} · Fila ${validation.rowLabel} · Assento ${validation.seatLabel}`}
            </p>
          ) : null}
          {validation.result === 'already_used' &&
          validation.usedAt !== null ? (
            <p className="text-sm text-muted-foreground">
              {usedAtLine(validation)}
            </p>
          ) : null}
        </div>
      ) : missingEventMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          {NO_EVENT_MESSAGE}
        </p>
      ) : null}
    </>
  );
}

export default ValidacaoPage;
