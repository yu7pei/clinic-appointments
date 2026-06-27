import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type { Appointment } from '../domain/appointment.js';
import { type Clock, systemClock } from '../domain/clock.js';
import { ConflictError } from '../domain/errors.js';
import type {
  AppointmentRepository,
  CreateAppointmentInput,
  ListAppointmentsQuery,
} from './appointment-repository.js';

export interface SqliteRepositoryOptions {
  readonly filename: string;
  readonly clock?: Clock;
  readonly idFactory?: () => string;
}

interface AppointmentRow {
  readonly id: string;
  readonly clinician_id: string;
  readonly patient_id: string;
  readonly starts_at: number;
  readonly ends_at: number;
  readonly created_at: number;
}

/**
 * SQLite-backed {@link AppointmentRepository}.
 *
 * Overlap prevention is a check-then-insert run inside a `BEGIN IMMEDIATE`
 * transaction, so SQLite serialises concurrent writers and two bookings for the
 * same slot cannot both succeed — no application-level lock needed.
 */
export class SqliteAppointmentRepository implements AppointmentRepository {
  private readonly db: Database.Database;
  private readonly clock: Clock;
  private readonly idFactory: () => string;

  constructor(options: SqliteRepositoryOptions) {
    if (options.filename !== ':memory:') {
      mkdirSync(dirname(options.filename), { recursive: true });
    }
    this.db = new Database(options.filename);
    this.db.pragma('journal_mode = WAL'); // concurrent readers alongside a writer
    this.db.pragma('foreign_keys = ON');
    this.clock = options.clock ?? systemClock;
    this.idFactory = options.idFactory ?? randomUUID;
    this.migrate();
  }

  /** Schema setup — safe to re-run on every startup. */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS appointments (
        id           TEXT PRIMARY KEY,
        clinician_id TEXT    NOT NULL,
        patient_id   TEXT    NOT NULL,
        starts_at    INTEGER NOT NULL,
        ends_at      INTEGER NOT NULL,
        created_at   INTEGER NOT NULL,
        CHECK (ends_at > starts_at)
      );
      CREATE INDEX IF NOT EXISTS idx_appointments_clinician_start
        ON appointments (clinician_id, starts_at);
    `);
  }

  async createIfNoOverlap(input: CreateAppointmentInput): Promise<Appointment> {
    const findClash = this.db.prepare<
      { clinicianId: string; startsAt: number; endsAt: number },
      { id: string }
    >(`
      SELECT id FROM appointments
      WHERE clinician_id = @clinicianId
        AND starts_at < @endsAt
        AND ends_at > @startsAt
      LIMIT 1
    `);

    const insert = this.db.prepare(`
      INSERT INTO appointments
        (id, clinician_id, patient_id, starts_at, ends_at, created_at)
      VALUES
        (@id, @clinicianId, @patientId, @startsAt, @endsAt, @createdAt)
    `);

    const create = this.db.transaction((data: CreateAppointmentInput): Appointment => {
      const clash = findClash.get({
        clinicianId: data.clinicianId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
      });
      if (clash) {
        throw new ConflictError(
          'Requested time overlaps an existing appointment for this clinician',
          { conflictingAppointmentId: clash.id },
        );
      }

      const appointment: Appointment = {
        id: this.idFactory(),
        clinicianId: data.clinicianId,
        patientId: data.patientId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        createdAt: this.clock.now(),
      };
      insert.run(appointment);
      return appointment;
    });

    // BEGIN IMMEDIATE grabs the write lock before the read; async so a thrown
    // ConflictError becomes a rejected promise rather than a sync throw.
    return create.immediate(input);
  }

  async list(query: ListAppointmentsQuery): Promise<Appointment[]> {
    const clauses = ['starts_at >= @from'];
    const params: Record<string, number | string> = { from: query.from };

    if (query.clinicianId !== undefined) {
      clauses.push('clinician_id = @clinicianId');
      params.clinicianId = query.clinicianId;
    }
    if (query.to !== undefined) {
      clauses.push('starts_at < @to');
      params.to = query.to;
    }

    let sql = `SELECT * FROM appointments WHERE ${clauses.join(' AND ')} ORDER BY starts_at ASC, id ASC`;
    if (query.limit !== undefined) {
      sql += ' LIMIT @limit';
      params.limit = query.limit;
      if (query.offset !== undefined) {
        sql += ' OFFSET @offset';
        params.offset = query.offset;
      }
    } else if (query.offset !== undefined) {
      sql += ' LIMIT -1 OFFSET @offset';
      params.offset = query.offset;
    }

    const rows = this.db.prepare<typeof params, AppointmentRow>(sql).all(params);
    return rows.map(toAppointment);
  }

  /** Releases the file handle — used by tests; harmless otherwise. */
  close(): void {
    this.db.close();
  }
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    clinicianId: row.clinician_id,
    patientId: row.patient_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}
