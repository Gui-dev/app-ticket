import { execSync } from 'node:child_process';

const EVENT_SLUG = 'o-fantasma-da-opera';
const PLATEIA_ROW_A = `row_id in (select sr.id from seat_rows sr join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = '${EVENT_SLUG}' and s.slug = 'plateia' and sr.label = 'A')`;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function query(sql: string): string {
  return execSync(
    `podman exec ticketvibe-postgres psql -U ticketvibe -d ticketvibe -At -c ${shellQuote(sql)}`,
    { encoding: 'utf8' },
  ).trim();
}

export function promoteOrganizerByEmail(email: string): void {
  query(`update "user" set role = 'organizer' where email = '${email}'`);
}

export function backdateHold(seatLabel: string): void {
  query(
    `update seats set hold_expires_at = now() - interval '1 second' where label = '${seatLabel}' and hold_user_id is not null and ${PLATEIA_ROW_A}`,
  );
}

export function readSeatStatus(seatLabel: string): string {
  return query(
    `select se.status from seats se join seat_rows sr on sr.id = se.row_id join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = '${EVENT_SLUG}' and s.slug = 'plateia' and sr.label = 'A' and se.label = '${seatLabel}'`,
  );
}

export function restoreSeat(seatLabel: string): void {
  const key = query(
    `select e.id || ':' || sr.id || ':' || se.id from seats se join seat_rows sr on sr.id = se.row_id join sectors s on s.id = sr.sector_id join events e on e.id = s.event_id where e.slug = '${EVENT_SLUG}' and s.slug = 'plateia' and sr.label = 'A' and se.label = '${seatLabel}'`,
  );
  if (key) {
    execSync(`podman exec ticketvibe-redis redis-cli del hold:seat:${key}`, {
      encoding: 'utf8',
    });
  }
  query(
    `update seats set status = 'available', hold_user_id = null, hold_expires_at = null where label = '${seatLabel}' and ${PLATEIA_ROW_A}`,
  );
}
