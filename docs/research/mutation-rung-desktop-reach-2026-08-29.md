# Does the mutation rung reach the desktop app? — measured, 2026-08-29

Three defects in `apps/desktop` were found by the owner opening the app rather than by any check.
`docs/research/mutation-rung-vitest-reach-2026-08-29.md` had just extended `check:mutation-diff`
from one test runner to two. The obvious next question — **is the desktop app covered?** — is
answered here by running the real check, not by reading its configuration.

The answer is **half**, and the missing half was **silent**.

## 1. `apps/desktop/src/` IS covered — shown, with a control in the same run

`apps/desktop`'s `test` script is `bun test --timeout 300000 src/ electron/`, so `runnerFor`
returns the bun runner and the project is in reach. That is what the config says. What the check
does was measured by planting a deliberately hollow test and running `pnpm check:mutation-diff`
three times, changing one thing between runs.

The subject, `apps/desktop/src/backend/reachDemo.ts` (a throwaway fixture, removed afterwards):

```ts
export function clampRetries(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 5) return 5;
  return value;
}
```

**Run 1 — the hollow test.** Every assertion holds for any implementation returning a number in
`[0,5]` that happens to be the identity on `3`:

```ts
const out = clampRetries(3);
expect(typeof out).toBe("number");
expect(out).toBeGreaterThanOrEqual(0);
expect(out).toBeLessThanOrEqual(5);
```

```
[mutation-diff] [1/1] bun runner over 1 file(s) in apps/desktop, witnessed by 1 test file(s)
[mutation-diff] 1 changed source file(s), 1 changed line span(s), 12 mutant(s) counted
[mutation-diff] 11 mutant(s) SURVIVED — no test noticed the change
EXIT=1
```

**Run 2 — the strengthened test**, one case per branch. Survivors **11 → 2**. The two remainders
are the `<`→`<=` and `>`→`>=` mutants, genuinely EQUIVALENT (at `value === 0` the strict form falls
through to `return value`, which is `0`; the loose form returns `0` directly — same output, so no
test can kill them). This is the same pair, for the same reason, that the studio demonstration hit.

**11 → 2 is the demonstration, and the threshold is read off the control rather than picked.** Run 1
says the rung reds on a hollow desktop test; run 2 says the count tracks test strength rather than
tracking nothing.

## 2. `apps/desktop/electron/` is NOT covered, and the drop printed NOTHING

The rung mutates only files under a project's `src/`. `apps/desktop` keeps four TypeScript files
outside it:

| file | lines | tests that load it |
| --- | --- | --- |
| `electron/backend-entry.ts` | 931 | **none** |
| `electron/main.ts` | 905 | **none** |
| `electron/preload.ts` | 155 | **none** |
| `electron/static-server.ts` | 149 | `static-server.test.ts` (54 lines) |

**2,140 lines — 45% of the desktop app's non-test TypeScript, including the entire sidecar route
table.** Seven desktop test files mention `backend-entry.ts`; every one of those mentions is a
COMMENT, describing a composition the test then reproduces in miniature. Nothing imports it.

The drop being *conservative* is defensible. The drop being *invisible* is not, and it was:

```
# branch touches apps/desktop/src/backend/reachDemo.ts AND apps/desktop/electron/static-server.ts
[mutation-diff] 1 changed source file(s), 1 changed line span(s), 12 mutant(s) counted
```

One. The 149-line Electron HTTP server that proxies every `/api/*` call and runs the loopback guard
was dropped without a word. Meanwhile a branch touching ONLY the electron file said so plainly:

```
[mutation-diff] SKIP — this branch changes no mutable source under a workspace project's src/
                — 1 changed .ts file(s) sit outside any project's src/
```

**The narrowing was announced exactly when it had cost nothing and went quiet exactly when it cost
something.** `selectMutationTargets`' own doc comment promised the opposite in its own words — "the
conservative direction for a mutation rung is to ask LESS, **and to say so**" — because the count
was only ever surfaced through `skipReason`, which the driver prints in the `targets.length === 0`
branch alone. This is the repo's standing fault class (a rung that quietly covers less than you
think) sitting one level out from the tests it grades, in the reassuring direction.

## 3. The repair, and what it deliberately does NOT do

Every dropped file is now returned on `TargetSelection.narrowed` and printed on EVERY run, in one
of two wordings, because the two are not the same news:

- `NARROWED: <file> … it sits outside <project>'s src/, which no unit test is written against.
  Dropped on purpose.` — the ordinary conservative drop (`scripts/`, `infra/`).
- `NARROWED (GAP): <file> … but <project>'s own test script runs that directory, so its tests do
  execute there. Nothing on this branch proves those lines.` — a real gap.

The classifier is derived, never listed: `declaredTestRoots` parses the project's own `test` script,
filtering candidate tokens by **whether they are directories**. That is what keeps `300000` out of
`--timeout 300000` without a denylist of runner words that must be extended whenever a script
changes shape. A hand-kept exception table in the checker would be a second source of truth for a
fact `package.json` already holds, and would go stale silently and reassuringly.

The formatter is PURE and unit-tested for the same reason the change exists: a report living only in
the I/O shell is a report nothing can test.

**It does not widen the boundary**, and that restraint is measured rather than cautious:

| what | mutants | wall | outcome |
| --- | --- | --- | --- |
| `electron/static-server.ts`, 3 spans | 14 | **5.0 s** | 3 NO-COVERAGE, 2 SURVIVED |
| `electron/backend-entry.ts`, 4 spans in the UAT-attest route | 35 | **5.6 s** | **26 of 26 NO-COVERAGE** |

Widening is CHEAP and does not abort. Stryker's dry run loads the TEST files, and no test imports
`backend-entry.ts`, so the top-level `main().catch(… process.exit(1))` that would otherwise kill the
whole rung is never reached — a hazard checked rather than assumed. But 26 of 26 NO-COVERAGE is the
blocker: widening today would red the desktop app's most-edited file until a test that actually
loads the sidecar is written, and neither `main.ts` (imports `electron`) nor `backend-entry.ts` is
exempt — the entry-point exemption reads ROOT scripts only, and `backend-entry.ts` is spawned via a
path `main.ts` builds at runtime, so no script names it at all.

So the gap is now **named on every branch that touches it**, which is the standard the project-level
`NARROWED:` line already set, and closing it is a separate increment with its own scoped cost.

## 4. What this does NOT claim

- It does not widen the rung to `electron/` (§3), nor to any other non-`src/` directory.
- It does not touch `mutation-rung-unproven-reds-only-on-ci` (the vendored bun-runner attribution
  defect, `docs/research/stryker-bun-attribution-2026-08-26.md`).
- The cost of the repair itself is zero mutants and one map lookup per dropped file.
- `packages/orchestrator` remains excluded by decision, unchanged.
