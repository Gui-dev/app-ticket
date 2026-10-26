'use client';

import type {
  OrganizerEventDto,
  OrganizerSalesReportDto,
} from '@ticketvibe/shared';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBRL, fromDateTimeLocalValue } from '@/lib/format';
import {
  fetchOrganizerEvents,
  fetchOrganizerSalesReport,
} from '@/lib/organizer-api';

const LOAD_FAILED_MESSAGE = 'Não foi possível carregar o relatório.';
const EVENTS_FAILED_MESSAGE = 'Não foi possível carregar os eventos.';
const EVENTS_PENDING_MESSAGE = 'Carregando os eventos...';
const REPORT_PENDING_MESSAGE = 'Carregando o relatório...';
const EMPTY_EVENTS_MESSAGE = 'Nenhum evento do organizador ainda.';
const EMPTY_REPORT_MESSAGE = 'Nenhuma venda no período.';
const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

type Period = { from?: string; to?: string };
type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

const ALERT_CLASS =
  'rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive';

function errorFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : GENERIC_MESSAGE;
}

function periodFrom(data: FormData): Period {
  const rawFrom = String(data.get('from') ?? '');
  const rawTo = String(data.get('to') ?? '');
  return {
    ...(rawFrom ? { from: fromDateTimeLocalValue(rawFrom) } : {}),
    ...(rawTo ? { to: fromDateTimeLocalValue(rawTo) } : {}),
  };
}

function RelatoriosPage() {
  const [events, setEvents] = useState<OrganizerEventDto[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<Period>({});
  const [report, setReport] = useState<OrganizerSalesReportDto | null>(null);
  const [reportState, setReportState] = useState<LoadState>('idle');
  const [reportError, setReportError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedEventId) return undefined;
    const controller = new AbortController();
    const period = appliedPeriod;

    async function loadReport() {
      setReportState('loading');
      setReportError(null);
      setReport(null);
      try {
        const loaded = await fetchOrganizerSalesReport(selectedEventId, period);
        if (controller.signal.aborted) return;
        setReport(loaded);
        setReportState('loaded');
      } catch (cause) {
        if (controller.signal.aborted) return;
        setReport(null);
        setReportError(errorFrom(cause));
        setReportState('failed');
      }
    }

    void loadReport();
    return () => controller.abort();
  }, [selectedEventId, appliedPeriod]);

  function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedPeriod(periodFrom(new FormData(event.currentTarget)));
  }

  const organizerEvents =
    events === null ? null : events.filter((item) => !item.platform);

  return (
    <>
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">
        Relatórios
      </h1>
      {eventsFailed ? (
        <p role="alert" className="text-sm text-destructive">
          {EVENTS_FAILED_MESSAGE}
        </p>
      ) : null}
      <label
        htmlFor="relatorios-evento"
        className="flex w-full max-w-sm flex-col gap-1.5 text-sm font-medium"
      >
        Evento
        <select
          id="relatorios-evento"
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
      <form
        onSubmit={handleApply}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
      >
        <label
          htmlFor="relatorios-de"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          De
          <Input
            id="relatorios-de"
            type="datetime-local"
            name="from"
            className="w-auto"
          />
        </label>
        <label
          htmlFor="relatorios-ate"
          className="flex flex-col gap-1.5 text-sm font-medium"
        >
          Até
          <Input
            id="relatorios-ate"
            type="datetime-local"
            name="to"
            className="w-auto"
          />
        </label>
        <Button type="submit">Aplicar</Button>
      </form>
      {reportError ? (
        <p role="alert" className={ALERT_CLASS}>
          {`${LOAD_FAILED_MESSAGE} ${reportError}`}
        </p>
      ) : reportState === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {REPORT_PENDING_MESSAGE}
        </p>
      ) : reportState === 'loaded' && report ? (
        report.ticketsSold === 0 ? (
          <p className="text-sm text-muted-foreground">
            {EMPTY_REPORT_MESSAGE}
          </p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">
                Ingressos vendidos
              </dt>
              <dd className="font-heading text-xl font-bold">
                {report.ticketsSold}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">
                Pedidos pagos
              </dt>
              <dd className="font-heading text-xl font-bold">
                {report.ordersCount}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">
                Faturamento bruto
              </dt>
              <dd className="font-heading text-xl font-bold">
                {formatBRL(report.grossCents)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">
                Taxa da plataforma
              </dt>
              <dd className="font-heading text-xl font-bold">
                {formatBRL(report.platformFeeCents)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-xs font-semibold text-muted-foreground">
                Líquido do evento
              </dt>
              <dd className="font-heading text-xl font-bold">
                {formatBRL(report.netCents)}
              </dd>
            </div>
          </dl>
        )
      ) : null}
    </>
  );
}

export default RelatoriosPage;
