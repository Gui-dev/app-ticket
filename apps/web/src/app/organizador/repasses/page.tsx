'use client';

import type {
  OrganizerConnectStatusDto,
  OrganizerTransferEntryDto,
  TransferStatus,
} from '@ticketvibe/shared';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatBRL, formatDatePtBR } from '@/lib/format';
import {
  fetchOrganizerConnectStatus,
  fetchOrganizerTransfers,
  retryOrganizerTransfer,
  startOrganizerConnect,
} from '@/lib/organizer-api';

const TRANSFERS_FAILED_MESSAGE = 'Não foi possível carregar os repasses.';
const TRANSFERS_PENDING_MESSAGE = 'Carregando os repasses...';
const EMPTY_TRANSFERS_MESSAGE = 'Nenhum repasse ainda.';
const RETRY_FAILED_MESSAGE =
  'Não foi possível reprocessar o repasse agora. Tente novamente.';

const CONNECTED_LABEL = 'Conta conectada; repasse automático';
const DISCONNECTED_LABEL = 'Não conectado';

const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  none: 'Sem repasse',
  pending: 'Pendente',
  succeeded: 'Repasse enviado',
  failed: 'Falha no repasse',
  skipped: 'Não aplicável',
};

const ALERT_CLASS =
  'rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive';

function RepassesPage() {
  const [connectStatus, setConnectStatus] =
    useState<OrganizerConnectStatusDto | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<
    OrganizerTransferEntryDto[] | null
  >(null);
  const [transfersFailed, setTransfersFailed] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        const status = await fetchOrganizerConnectStatus();
        if (controller.signal.aborted) return;
        setConnectStatus(status);
      } catch {
        if (controller.signal.aborted) return;
      }
    }

    void loadStatus();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      fetchOrganizerConnectStatus()
        .then((status) => {
          if (active) setConnectStatus(status);
        })
        .catch(() => {});
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const payoutsEnabled = connectStatus?.payoutsEnabled;

  useEffect(() => {
    if (payoutsEnabled !== false || onboardingUrl !== null) return undefined;
    const controller = new AbortController();

    async function loadOnboardingUrl() {
      try {
        const url = await startOrganizerConnect();
        if (controller.signal.aborted) return;
        setOnboardingUrl(url);
      } catch {
        if (controller.signal.aborted) return;
      }
    }

    void loadOnboardingUrl();
    return () => controller.abort();
  }, [payoutsEnabled, onboardingUrl]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTransfers() {
      setTransfersFailed(false);
      try {
        const loaded = await fetchOrganizerTransfers();
        if (controller.signal.aborted) return;
        setTransfers(loaded);
      } catch {
        if (controller.signal.aborted) return;
        setTransfers(null);
        setTransfersFailed(true);
      }
    }

    void loadTransfers();
    return () => controller.abort();
  }, []);

  async function handleRetry(orderId: string) {
    setRetryFailed(false);
    setRetryingOrderId(orderId);
    try {
      await retryOrganizerTransfer(orderId);
      const loaded = await fetchOrganizerTransfers();
      setTransfers(loaded);
      setTransfersFailed(false);
    } catch {
      setRetryFailed(true);
    } finally {
      setRetryingOrderId(null);
    }
  }

  return (
    <>
      <h1 className="font-heading text-3xl font-bold sm:text-4xl">Repasses</h1>
      <section
        aria-label="Conexão com o Stripe"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
      >
        {connectStatus === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando a conexão...
          </p>
        ) : (
          <span className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            {payoutsEnabled ? CONNECTED_LABEL : DISCONNECTED_LABEL}
          </span>
        )}
        {payoutsEnabled === false && onboardingUrl !== null ? (
          <a
            href={onboardingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Conectar Stripe
          </a>
        ) : null}
      </section>
      {retryFailed ? (
        <p role="alert" className={ALERT_CLASS}>
          {RETRY_FAILED_MESSAGE}
        </p>
      ) : null}
      {transfersFailed ? (
        <p role="alert" className="text-sm text-destructive">
          {TRANSFERS_FAILED_MESSAGE}
        </p>
      ) : transfers === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          {TRANSFERS_PENDING_MESSAGE}
        </p>
      ) : transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {EMPTY_TRANSFERS_MESSAGE}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Evento
                </th>
                <th scope="col" className="px-4 py-3">
                  Bruto
                </th>
                <th scope="col" className="px-4 py-3">
                  Taxa da plataforma
                </th>
                <th scope="col" className="px-4 py-3">
                  Líquido do organizador
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((entry) => (
                <tr key={entry.orderId} className="border-b border-border/60">
                  <th scope="row" className="px-4 py-3 font-medium">
                    {entry.eventTitle}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatDatePtBR(entry.createdAt)}
                    </span>
                  </th>
                  <td className="px-4 py-3">{formatBRL(entry.grossCents)}</td>
                  <td className="px-4 py-3">
                    {formatBRL(entry.platformFeeCents)}
                  </td>
                  <td className="px-4 py-3">
                    {formatBRL(entry.organizerNetCents)}
                  </td>
                  <td className="px-4 py-3">
                    {TRANSFER_STATUS_LABELS[entry.transferStatus]}
                  </td>
                  <td className="px-4 py-3">
                    {entry.transferStatus === 'failed' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={retryingOrderId === entry.orderId}
                        onClick={() => void handleRetry(entry.orderId)}
                      >
                        Reprocessar repasse
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default RepassesPage;
