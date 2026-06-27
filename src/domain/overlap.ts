/**
 * The booking-collision rule, kept in one place. Appointments are half-open
 * intervals `[startsAt, endsAt)`, so touching ends (`a.end === b.start`) do not
 * overlap and back-to-back bookings are allowed. Times are UTC epoch ms.
 */
export interface TimeInterval {
  readonly startsAt: number;
  readonly endsAt: number;
}

export function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
