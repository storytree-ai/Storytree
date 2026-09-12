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

// ── the runtime-skip arm (ADR-0566) ──────────────────────────────────────────
// These two belong to `runtime-skip.test.ts`, not to `subject.test.ts`. They are a PAIR on purpose:
// the defect they guard shifts each coverage bucket onto the next test along, so detecting it needs
// two tests after the skip with DISJOINT subjects — `epsilon`'s coverage then lands on ZETA, nothing
// covers `epsilon`, and its mutant comes back Survived. Nothing above this line may call them.

/** Killed only by PROBE_EPSILON, which runs AFTER a test that skips at runtime. */
export function epsilon(n: number): number {
  return n / 2;
}

/** Killed only by PROBE_ZETA, the test after PROBE_EPSILON. */
export function zeta(n: number): number {
  return -n;
}
