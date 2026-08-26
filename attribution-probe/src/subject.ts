// Controlled subject for validating mutation-kill ATTRIBUTION (not for measuring a score).
// Every mutant below is arranged so that exactly one known test kills it, or none does.

/** Killed only by the FIRST test. */
export function alpha(n: number): number {
  return n + 1;
}

/** Killed only by the SECOND test. */
export function beta(s: string): string {
  return s.toUpperCase();
}

/** Covered by TWO tests; the `*` mutant is killed by only ONE of them. */
export function delta(n: number): number {
  return n * 2;
}

/** Killed only by the LAST test; its `n > 1000` branch is covered but unasserted. */
export function gamma(n: number): string {
  if (n > 1000) {
    return "big";
  }
  return "small";
}
