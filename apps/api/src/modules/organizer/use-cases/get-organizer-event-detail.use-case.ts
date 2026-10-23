import type {
  FindEventForOrganizerResult,
  OrganizerEventRecord,
  OrganizerRepository,
  OrganizerSectorRecord,
} from '../domain/organizer-repository';

export type GetOrganizerEventDetailResult =
  | {
      kind: 'ok';
      event: OrganizerEventRecord;
      sectors: OrganizerSectorRecord[];
    }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export class GetOrganizerEventDetailUseCase {
  constructor(private readonly organizerRepository: OrganizerRepository) {}

  async execute(input: {
    eventId: string;
    userId: string;
  }): Promise<GetOrganizerEventDetailResult> {
    const result: FindEventForOrganizerResult =
      await this.organizerRepository.findEventForOrganizer(input);
    if (result.kind !== 'ok') return result;
    const sectors: OrganizerSectorRecord[] =
      await this.organizerRepository.listSectorsForEvent(input.eventId);
    return { kind: 'ok', event: result.event, sectors };
  }
}
