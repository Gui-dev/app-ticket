import type { BestSeat, SeatmapSector } from './seatmap-entity.js';

export function pickBestSeat(sector: SeatmapSector): BestSeat | null {
  for (const row of sector.rows) {
    if (row.seats.length === 0) continue;
    const center = (row.seats.length - 1) / 2;
    let best: { label: string; position: number; distance: number } | null =
      null;
    for (let position = 0; position < row.seats.length; position += 1) {
      const seat = row.seats[position];
      if (seat.status !== 'available') continue;
      const distance = Math.abs(position - center);
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && position < best.position)
      ) {
        best = { label: seat.label, position, distance };
      }
    }
    if (best) {
      return {
        sectorSlug: sector.slug,
        rowLabel: row.label,
        seatLabel: best.label,
        priceFromCents: sector.priceFromCents,
      };
    }
  }
  return null;
}
