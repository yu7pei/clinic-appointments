import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FixedClock } from '../src/domain/clock.js';
import { SqliteAppointmentRepository } from '../src/repository/sqlite-appointment-repository.js';
import { ActorStore } from '../src/repository/actor-store.js';

/** A fixed "now" so past/upcoming logic is deterministic across machines. */
export const NOW_ISO = '2026-06-25T08:00:00Z';
export const NOW_MS = Date.parse(NOW_ISO);

/**
 * Builds an app with fully deterministic dependencies: a frozen clock, a
 * sequential id factory, and an isolated in-process SQLite database, so
 * assertions can pin exact ids and times and each test starts clean.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const clock = new FixedClock(NOW_MS);
  let seq = 0;
  const repository = new SqliteAppointmentRepository({
    filename: ':memory:',
    clock,
    idFactory: () => `appt-${++seq}`,
  });
  const actors = new ActorStore(clock);

  return buildApp({ clock, repository, actors });
}
