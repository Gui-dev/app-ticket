import type {
  OrganizerRepository,
  WriteSectorResult,
} from '../domain/organizer-repository';

export interface DeleteRowInput {
  rowId: string;
  userId: string;
}

export class DeleteRowUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: DeleteRowInput): Promise<WriteSectorResult> {
    return this.organizerRepository.deleteRow(input);
  }
}
