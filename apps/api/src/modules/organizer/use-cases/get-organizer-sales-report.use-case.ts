import type {
  OrganizerRepository,
  SalesReportForOrganizerResult,
} from '../domain/organizer-repository';

export interface GetSalesReportInput {
  eventId: string;
  userId: string;
  from: Date | null;
  to: Date | null;
}

export class GetSalesReportUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(
    input: GetSalesReportInput,
  ): Promise<SalesReportForOrganizerResult> {
    return this.organizerRepository.salesReportForOrganizer(input);
  }
}
