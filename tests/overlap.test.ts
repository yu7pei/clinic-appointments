import { describe, expect, it } from 'vitest';
import { overlaps } from '../src/domain/overlap.js';

/**
 * The overlap rule is the heart of the system, so it gets an exhaustive,
 * boundary-focused table rather than one happy-path check. Reference interval:
 * [10:00, 11:00).
 */
const base = { startsAt: 1000, endsAt: 2000 };

describe('overlaps', () => {
  const cases: Array<{ name: string; other: { startsAt: number; endsAt: number }; expected: boolean }> = [
    { name: 'identical interval', other: { startsAt: 1000, endsAt: 2000 }, expected: true },
    { name: 'fully contained inside base', other: { startsAt: 1200, endsAt: 1800 }, expected: true },
    { name: 'fully contains base', other: { startsAt: 500, endsAt: 2500 }, expected: true },
    { name: 'partial overlap on the left', other: { startsAt: 500, endsAt: 1500 }, expected: true },
    { name: 'partial overlap on the right', other: { startsAt: 1500, endsAt: 2500 }, expected: true },
    { name: 'touching at base.end (other starts where base ends)', other: { startsAt: 2000, endsAt: 3000 }, expected: false },
    { name: 'touching at base.start (other ends where base starts)', other: { startsAt: 0, endsAt: 1000 }, expected: false },
    { name: 'entirely before base', other: { startsAt: 0, endsAt: 500 }, expected: false },
    { name: 'entirely after base', other: { startsAt: 2500, endsAt: 3000 }, expected: false },
    { name: 'overlap by a single millisecond on the right', other: { startsAt: 1999, endsAt: 2999 }, expected: true },
  ];

  for (const { name, other, expected } of cases) {
    it(`${expected ? 'detects' : 'allows'}: ${name}`, () => {
      expect(overlaps(base, other)).toBe(expected);
      // Overlap is symmetric — the order of arguments must not matter.
      expect(overlaps(other, base)).toBe(expected);
    });
  }
});
