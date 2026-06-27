import type { TimeInterval } from './overlap.js';

/** A persisted appointment. All instants are epoch milliseconds in UTC. */
export interface Appointment extends TimeInterval {
  readonly id: string;
  readonly clinicianId: string;
  readonly patientId: string;
  readonly createdAt: number;
}
