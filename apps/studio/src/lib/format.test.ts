// formatAge — the compact age formatter the build/claim layers render with. Rehomed here from
// the retired presence lib (ADR-0200 D7); the cases carry over from its old suite.

import { describe, it, expect } from 'vitest';
import { formatAge } from './format';

const BASE = new Date('2026-07-16T12:00:00.000Z');
const minutesAgo = (m: number): string => new Date(BASE.getTime() - m * 60_000).toISOString();

describe('formatAge', () => {
  it('renders minutes under an hour, whole hours after', () => {
    expect(formatAge(minutesAgo(12), BASE)).toBe('12m');
    expect(formatAge(minutesAgo(150), BASE)).toBe('2h');
  });

  it('clamps a future timestamp (clock skew) to 0m rather than a negative age', () => {
    expect(formatAge(minutesAgo(-5), BASE)).toBe('0m');
  });
});
