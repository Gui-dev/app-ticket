import type {
  DeleteLotResult,
  OrganizerRepository,
} from '../domain/organizer-repository';

export class DeleteLotUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: {
    lotId: string;
    userId: string;
  }): Promise<DeleteLotResult> {
    return this.organizerRepository.deleteLot(input);
  }
}
