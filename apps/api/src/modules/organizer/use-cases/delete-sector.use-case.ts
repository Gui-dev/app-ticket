import type {
  OrganizerRepository,
  WriteSectorResult,
} from '../domain/organizer-repository';

export interface DeleteSectorInput {
  sectorId: string;
  userId: string;
}

export class DeleteSectorUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: DeleteSectorInput): Promise<WriteSectorResult> {
    return this.organizerRepository.deleteSector(input);
  }
}
