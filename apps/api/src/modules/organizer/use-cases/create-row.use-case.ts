import type {
  CreateSectorResult,
  OrganizerRepository,
} from '../domain/organizer-repository';

export interface CreateRowInput {
  sectorId: string;
  userId: string;
  label: string;
  seatCount: number;
}

export class CreateRowUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: CreateRowInput): Promise<CreateSectorResult> {
    return this.organizerRepository.createRow(input);
  }
}
