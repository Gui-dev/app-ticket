import type {
  SeatAvailabilityBroker,
  SeatStatusDelta,
} from '../domain/seat-availability-broker.js';

export class InMemorySeatAvailabilityBroker implements SeatAvailabilityBroker {
  readonly published: SeatStatusDelta[] = [];

  publish(deltas: SeatStatusDelta[]): void {
    this.published.push(...deltas);
  }
}
