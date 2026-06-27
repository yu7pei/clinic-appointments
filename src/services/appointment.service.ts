
import type { Appointment } from '../domain/appointment.js';
import type { Clock } from '../domain/clock.js';
import { ValidationError } from '../domain/errors.js';
import type {
  AppointmentRepository,
  ListAppointmentsQuery,
} from '../repository/appointment-repository.js';
import type { ActorStore } from '../repository/actor-store.js';
import type { CreateAppointmentBody } from '../dto/schemas.js';

export interface ListUpcomingQuery {
  readonly clinicianId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AppointmentServiceDeps {
  readonly repository: AppointmentRepository;
  readonly actors: ActorStore;
  readonly clock: Clock;
}

/**
 * Application layer: parses input, applies booking policy (no past dates, ensure
 * actors exist), and delegates the no-overlap guarantee to the repository.
 */
export class AppointmentService {
  private readonly repository: AppointmentRepository;
  private readonly actors: ActorStore;
  private readonly clock: Clock;

  constructor(deps: AppointmentServiceDeps) {
    this.repository = deps.repository;
    this.actors = deps.actors;
    this.clock = deps.clock;
  }

  async book(input: CreateAppointmentBody): Promise<Appointment> {
    // Schema validation already guaranteed parseable ISO + start < end. We
    // re-parse to epoch ms here so the rest of the system is timezone-free.
    const startsAt = Date.parse(input.start);
    const endsAt = Date.parse(input.end);

    if (startsAt < this.clock.now()) {
      throw new ValidationError('Cannot book an appointment in the past');
    }

    this.actors.ensureClinician(input.clinicianId);
    this.actors.ensurePatient(input.patientId);

    return this.repository.createIfNoOverlap({
      clinicianId: input.clinicianId,
      patientId: input.patientId,
      startsAt,
      endsAt,
    });
  }

  /** Upcoming appointments, optionally scoped to one clinician and a window. */
  async listUpcoming(query: ListUpcomingQuery): Promise<Appointment[]> {
    // "Upcoming" means start >= now, but an explicit `from` overrides it so
    // callers can look at any window they ask for.
    const from = query.from ? Date.parse(query.from) : this.clock.now();
    const to = query.to ? Date.parse(query.to) : undefined;

    const repoQuery: ListAppointmentsQuery = {
      clinicianId: query.clinicianId,
      from,
      to,
      limit: query.limit,
      offset: query.offset,
    };
    return this.repository.list(repoQuery);
  }
}
