import {
  type OrganizerConnectStatusDto,
  type OrganizerEventCreate,
  type OrganizerEventDetailDto,
  type OrganizerEventDto,
  type OrganizerLotCreate,
  type OrganizerRowCreate,
  type OrganizerSalesReportDto,
  type OrganizerSectorCreate,
  type OrganizerTicketValidationDto,
  type OrganizerTransferEntryDto,
  type OrganizerVenueCreate,
  type OrganizerVenueDto,
  organizerConnectResponseSchema,
  organizerConnectStatusSchema,
  organizerEventDetailResponseSchema,
  organizerEventListResponseSchema,
  organizerEventResponseSchema,
  organizerSalesReportResponseSchema,
  organizerTicketValidationResponseSchema,
  organizerTransferRetryResponseSchema,
  organizerTransfersResponseSchema,
  organizerVenueListResponseSchema,
  organizerVenueResponseSchema,
  type TransferStatus,
} from '@ticketvibe/shared';

const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';
const NETWORK_MESSAGE =
  'Não foi possível conectar ao servidor. Tente novamente.';

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sua sessão expirou. Faça login novamente.',
  not_organizer: 'Você não tem permissão para acessar esta área.',
  invalid_body: 'Verifique os dados informados e tente novamente.',
  event_not_found: 'Evento não encontrado.',
  event_forbidden: 'Você não tem permissão para gerenciar este evento.',
  category_not_found: 'Categoria não encontrada.',
  venue_not_found: 'Local não encontrado.',
  event_has_orders:
    'Não é possível alterar este evento porque ele já tem pedidos.',
  sector_not_found: 'Setor não encontrado.',
  sector_forbidden: 'Você não tem permissão para gerenciar este setor.',
  sector_has_orders: 'Há ingressos vendidos neste setor.',
  row_not_found: 'Fila não encontrada.',
  row_forbidden: 'Você não tem permissão para gerenciar esta fila.',
  row_label_conflict: 'Já existe uma fila com esse nome neste setor.',
  sector_conflict: 'Já existe um setor com esse nome neste evento.',
  row_has_orders: 'Há ingressos vendidos nessa fila.',
  invalid_period: 'O período do lote é inválido.',
  lot_overlaps: 'Setor já tem um lote nesse período.',
  lot_not_found: 'Lote não encontrado.',
  lot_forbidden: 'Você não tem permissão para gerenciar este lote.',
  invalid_query: 'Período inválido.',
  order_not_found: 'Pedido não encontrado.',
  transfer_not_retryable: 'Este repasse não pode ser reprocessado.',
};

export type { OrganizerEventDto, OrganizerVenueDto };

function messageFor(status: number, payload: unknown): string {
  const code =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload.error as unknown)
      : undefined;
  if (typeof code === 'string' && Object.hasOwn(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code];
  }
  console.error(
    `Organizer API returned an unmapped error (status ${status}).`,
    code,
  );
  return GENERIC_MESSAGE;
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/organizer/${path}`, {
      cache: 'no-store',
      ...init,
    });
  } catch (error) {
    console.error('Organizer API request failed:', error);
    throw new Error(NETWORK_MESSAGE);
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new Error(messageFor(response.status, payload));
  }
  try {
    return await response.json();
  } catch (error) {
    console.error('Organizer API returned invalid JSON:', error);
    throw new Error(GENERIC_MESSAGE);
  }
}

async function postJson(path: string, input: unknown): Promise<unknown> {
  return requestJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function patchJson(path: string, input: unknown): Promise<unknown> {
  return requestJson(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function deleteJson(path: string): Promise<unknown> {
  return requestJson(path, { method: 'DELETE' });
}

export async function fetchOrganizerEvents(): Promise<OrganizerEventDto[]> {
  const result = organizerEventListResponseSchema.safeParse(
    await requestJson('events'),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.events;
}

export async function fetchOrganizerSalesReport(
  eventId: string,
  period?: { from?: string; to?: string },
): Promise<OrganizerSalesReportDto> {
  const params: string[] = [];
  if (period?.from) params.push(`from=${encodeURIComponent(period.from)}`);
  if (period?.to) params.push(`to=${encodeURIComponent(period.to)}`);
  const search = params.length > 0 ? `?${params.join('&')}` : '';
  const result = organizerSalesReportResponseSchema.safeParse(
    await requestJson(`events/${encodeURIComponent(eventId)}/report${search}`),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.report;
}

export async function fetchOrganizerTicketValidation(
  eventId: string,
  input: { code: string },
): Promise<OrganizerTicketValidationDto> {
  const result = organizerTicketValidationResponseSchema.safeParse(
    await postJson(
      `events/${encodeURIComponent(eventId)}/tickets/validate`,
      input,
    ),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.validation;
}

export async function fetchOrganizerEvent(
  id: string,
): Promise<OrganizerEventDetailDto> {
  const result = organizerEventDetailResponseSchema.safeParse(
    await requestJson(`events/${encodeURIComponent(id)}`),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.event;
}

export async function createOrganizerEvent(
  input: OrganizerEventCreate,
): Promise<OrganizerEventDto> {
  const result = organizerEventResponseSchema.safeParse(
    await postJson('events', input),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.event;
}

export async function updateOrganizerEvent(
  id: string,
  input: OrganizerEventCreate,
): Promise<OrganizerEventDto> {
  const result = organizerEventResponseSchema.safeParse(
    await patchJson(`events/${encodeURIComponent(id)}`, input),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.event;
}

export async function fetchOrganizerVenues(): Promise<OrganizerVenueDto[]> {
  const result = organizerVenueListResponseSchema.safeParse(
    await requestJson('venues'),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.venues;
}

export async function createOrganizerVenue(
  input: OrganizerVenueCreate,
): Promise<OrganizerVenueDto> {
  const result = organizerVenueResponseSchema.safeParse(
    await postJson('venues', input),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.venue;
}

export async function updateOrganizerVenue(
  id: string,
  input: OrganizerVenueCreate,
): Promise<OrganizerVenueDto> {
  const result = organizerVenueResponseSchema.safeParse(
    await patchJson(`venues/${encodeURIComponent(id)}`, input),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.venue;
}

export async function createOrganizerSector(
  eventId: string,
  input: OrganizerSectorCreate,
): Promise<void> {
  await postJson(`events/${encodeURIComponent(eventId)}/sectors`, input);
}

export async function deleteOrganizerSector(sectorId: string): Promise<void> {
  await deleteJson(`sectors/${encodeURIComponent(sectorId)}`);
}

export async function createOrganizerRow(
  sectorId: string,
  input: OrganizerRowCreate,
): Promise<void> {
  await postJson(`sectors/${encodeURIComponent(sectorId)}/rows`, input);
}

export async function deleteOrganizerRow(rowId: string): Promise<void> {
  await deleteJson(`rows/${encodeURIComponent(rowId)}`);
}

export async function createOrganizerLot(
  sectorId: string,
  input: OrganizerLotCreate,
): Promise<void> {
  await postJson(`sectors/${encodeURIComponent(sectorId)}/lots`, input);
}

export async function updateOrganizerLot(
  lotId: string,
  input: OrganizerLotCreate,
): Promise<void> {
  await patchJson(`lots/${encodeURIComponent(lotId)}`, input);
}

export async function deleteOrganizerLot(lotId: string): Promise<void> {
  await deleteJson(`lots/${encodeURIComponent(lotId)}`);
}

export async function fetchOrganizerConnectStatus(): Promise<OrganizerConnectStatusDto> {
  const result = organizerConnectStatusSchema.safeParse(
    await requestJson('payments/connect'),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data;
}

export async function startOrganizerConnect(): Promise<string | null> {
  const result = organizerConnectResponseSchema.safeParse(
    await postJson('payments/connect', {}),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.onboardingUrl;
}

export async function fetchOrganizerTransfers(): Promise<
  OrganizerTransferEntryDto[]
> {
  const result = organizerTransfersResponseSchema.safeParse(
    await requestJson('payments/transfers'),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.transfers;
}

export async function retryOrganizerTransfer(
  orderId: string,
): Promise<TransferStatus> {
  const result = organizerTransferRetryResponseSchema.safeParse(
    await postJson(
      `payments/transfers/${encodeURIComponent(orderId)}/retry`,
      {},
    ),
  );
  if (!result.success) throw payloadError(result.error);
  return result.data.transferStatus;
}

function payloadError(error: unknown): Error {
  console.error('Organizer API payload broke its contract:', error);
  return new Error(GENERIC_MESSAGE);
}
