/**
 * Time as an injected dependency, so tests can pass a fixed clock instead of
 * the real wall clock and stay deterministic.
 */
export interface Clock {
  /** Current instant as epoch milliseconds (UTC). */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export class FixedClock implements Clock {
  constructor(private current: number) {}

  now(): number {
    return this.current;
  }

  advanceBy(milliseconds: number): void {
    this.current += milliseconds;
  }
}
