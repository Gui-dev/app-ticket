import type {
  CreateSectorInput,
  CreateSectorResult,
  OrganizerRepository,
} from '../domain/organizer-repository';

export class CreateSectorUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: CreateSectorInput): Promise<CreateSectorResult> {
    return this.organizerRepository.createSector(input);
  }
}
