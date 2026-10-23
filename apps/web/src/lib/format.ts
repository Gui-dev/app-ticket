export { formatBRL, formatDatePtBR } from '@ticketvibe/shared';

const SAO_PAULO_ZONE = 'America/Sao_Paulo';

function pickPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

function offsetInMilliseconds(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const year = Number(pickPart(parts, 'year'));
  const month = Number(pickPart(parts, 'month'));
  const day = Number(pickPart(parts, 'day'));
  const hour = Number(pickPart(parts, 'hour'));
  const minute = Number(pickPart(parts, 'minute'));
  const second = Number(pickPart(parts, 'second'));
  return Date.UTC(year, month - 1, day, hour, minute, second) - at.getTime();
}

export function toDateTimeLocalValue(isoDate: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(isoDate));
  return `${pickPart(parts, 'year')}-${pickPart(parts, 'month')}-${pickPart(parts, 'day')}T${pickPart(parts, 'hour')}:${pickPart(parts, 'minute')}`;
}

export function fromDateTimeLocalValue(value: string): string {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = offsetInMilliseconds(SAO_PAULO_ZONE, new Date(naiveUtc));
  offset = offsetInMilliseconds(SAO_PAULO_ZONE, new Date(naiveUtc - offset));
  return new Date(naiveUtc - offset).toISOString();
}
