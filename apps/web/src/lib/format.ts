const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDatePtBR(isoDate: string): string {
  const formatted = dateFormatter.format(new Date(isoDate));
  const [day, month, year] = formatted.split(' de ');
  return `${day} de ${capitalize(month)}, ${year}`;
}

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100).replace(/\u00a0/g, ' ');
}
