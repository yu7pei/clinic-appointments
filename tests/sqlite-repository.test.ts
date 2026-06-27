import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteAppointmentRepository } from '../src/repository/sqlite-appointment-repository.js';
import { FixedClock } from '../src/domain/clock.js';
import { ConflictError } from '../src/domain/errors.js';

/**
 * Runs the repository contract against the real SQLite implementation (using an
 * in-memory database). It mirrors the behaviour the in-memory repository is
 * tested for, proving both implementations honour the same interface — and that
 * overlap prevention works through an actual SQL transaction.
 */
let repo: SqliteAppointmentRepository;

const slot = {
  clinicianId: 'clin-1',
  patientId: 'pat-1',
  startsAt: Date.parse('2027-01-01T09:00:00Z'),
  endsAt: Date.parse('2027-01-01T09:30:00Z'),
};

beforeEach(() => {
  let seq = 0;
  repo = new SqliteAppointmentRepository({
    filename: ':memory:',
    clock: new FixedClock(Date.parse('2026-06-25T08:00:00Z')),
    idFactory: () => `appt-${++seq}`,
  });
});

afterEach(() => {
  repo.close();
});

describe('SqliteAppointmentRepository', () => {
  it('creates and persists an appointment', async () => {
    const created = await repo.createIfNoOverlap(slot);
    expect(created).toMatchObject({ id: 'appt-1', clinicianId: 'clin-1' });

    const listed = await repo.list({ from: 0 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe('appt-1');
  });

  it('rejects an overlapping appointment with a ConflictError', async () => {
    await repo.createIfNoOverlap(slot);
    await expect(
      repo.createIfNoOverlap({
        ...slot,
        patientId: 'pat-2',
        startsAt: Date.parse('2027-01-01T09:15:00Z'),
        endsAt: Date.parse('2027-01-01T09:45:00Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows a back-to-back appointment that only touches at the endpoint', async () => {
    await repo.createIfNoOverlap(slot);
    const adjacent = await repo.createIfNoOverlap({
      ...slot,
      patientId: 'pat-2',
      startsAt: Date.parse('2027-01-01T09:30:00Z'),
      endsAt: Date.parse('2027-01-01T10:00:00Z'),
    });
    expect(adjacent.startsAt).toBe(Date.parse('2027-01-01T09:30:00Z'));
  });

  it('filters a list by clinician and date window, sorted by start', async () => {
    await repo.createIfNoOverlap({ ...slot, startsAt: Date.parse('2027-01-01T11:00:00Z'), endsAt: Date.parse('2027-01-01T11:30:00Z') });
    await repo.createIfNoOverlap({ ...slot, patientId: 'p', startsAt: Date.parse('2027-01-01T09:00:00Z'), endsAt: Date.parse('2027-01-01T09:30:00Z') });
    await repo.createIfNoOverlap({ ...slot, clinicianId: 'clin-2', startsAt: Date.parse('2027-01-01T09:00:00Z'), endsAt: Date.parse('2027-01-01T09:30:00Z') });

    const clin1 = await repo.list({ clinicianId: 'clin-1', from: 0 });
    expect(clin1.map((a) => a.startsAt)).toEqual([
      Date.parse('2027-01-01T09:00:00Z'),
      Date.parse('2027-01-01T11:00:00Z'),
    ]);
  });

  it('admits exactly one of many concurrent identical bookings', async () => {
    const attempts = 50;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => repo.createIfNoOverlap(slot)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(attempts - 1);
  });
});
