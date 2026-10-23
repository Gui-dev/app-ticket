import type {
  OrganizerRepository,
  WriteLotResult,
} from '../domain/organizer-repository';

export class CreateLotUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: {
    sectorId: string;
    userId: string;
    name: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }): Promise<WriteLotResult> {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      return { kind: 'invalid_period' };
    }
    return this.organizerRepository.createLot(input);
  }
}
