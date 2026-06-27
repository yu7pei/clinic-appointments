import type { Appointment } from '../domain/appointment.js';

/** Fields needed to create an appointment; id and createdAt are set by the store. */
export interface CreateAppointmentInput {
  readonly clinicianId: string;
  readonly patientId: string;
  readonly startsAt: number;
  readonly endsAt: number;
}

/** A half-open `[from, to)` window plus optional paging, all in epoch ms. */
export interface ListAppointmentsQuery {
  /** Restrict to one clinician; omit for the admin-wide view. */
  readonly clinicianId?: string;
  /** Lower bound on start (inclusive). Defaults to "now" at the call site. */
  readonly from: number;
  /** Upper bound on start (exclusive). Omit for no upper bound. */
  readonly to?: number;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Persistence boundary. Upper layers depend on this interface, not on SQLite,
 * so swapping the datastore is just another implementation. Async because a
 * real datastore is.
 */
export interface AppointmentRepository {
  /**
   * Create an appointment unless it overlaps an existing one for the same
   * clinician. Must be atomic (check and insert in one step).
   * @throws ConflictError on overlap.
   */
  createIfNoOverlap(input: CreateAppointmentInput): Promise<Appointment>;

  /** Appointments matching the window, sorted by start ascending. */
  list(query: ListAppointmentsQuery): Promise<Appointment[]>;
}
