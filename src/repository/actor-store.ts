import type { Clock } from '../domain/clock.js';
import { systemClock } from '../domain/clock.js';

export type ActorRole = 'patient' | 'clinician';

export interface Actor {
  readonly id: string;
  readonly role: ActorRole;
  readonly createdAt: number;
}

/**
 * Tracks clinicians and patients. Unknown ids are auto-created on first
 * reference (the brief allows this); a real system would require registration
 * and return 404 instead.
 */
export class ActorStore {
  private readonly clinicians = new Map<string, Actor>();
  private readonly patients = new Map<string, Actor>();
  private readonly clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  ensureClinician(id: string): Actor {
    return this.ensure(this.clinicians, id, 'clinician');
  }

  ensurePatient(id: string): Actor {
    return this.ensure(this.patients, id, 'patient');
  }

  private ensure(store: Map<string, Actor>, id: string, role: ActorRole): Actor {
    const existing = store.get(id);
    if (existing) return existing;

    const actor: Actor = { id, role, createdAt: this.clock.now() };
    store.set(id, actor);
    return actor;
  }
}
