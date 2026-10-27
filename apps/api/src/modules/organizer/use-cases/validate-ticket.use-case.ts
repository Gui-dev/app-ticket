import type {
  OrganizerRepository,
  TicketValidationForOrganizerInput,
  TicketValidationForOrganizerResult,
} from '../domain/organizer-repository';

export class ValidateTicketUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(
    input: TicketValidationForOrganizerInput,
  ): Promise<TicketValidationForOrganizerResult> {
    return this.organizerRepository.validateTicketForOrganizer(input);
  }
}
