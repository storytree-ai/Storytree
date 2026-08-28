# The mutation rung reaches the vitest projects — measured, 2026-08-29

`check:mutation-diff` (ADR-0458) could not mutate `apps/studio` or `packages/app-surface`. It now
can. This is the measurement record: what the gap actually was, that the extension can FAIL, and
what it costs.

## 1. The gap was three projects, not one

The rung narrowed itself to projects whose `test` script runs under Bun. The other three:

| project | `test` script | status now |
| --- | --- | --- |
| `apps/studio` | `vitest run` | **covered** (vitest runner) |
| `packages/app-surface` | `vitest run` | **covered** (vitest runner) |
| `packages/orchestrator` | `node --import tsx --test "src/**/*.test.ts"` | **excluded, by decision** |

The two vitest projects are the repo's entire browser-facing surface, which is why the gap was worth
closing: nothing mechanical stood between a hollow test and the visual side of the app.

**The drop was never silent** — the driver already printed `NARROWED: <dir> is out of this rung's
reach` for a touched project it could not run. It was an honest hole, and this closes it rather than
merely re-describing it. (`docs/research/coverage-*` fault-class notes: a rung that quietly covers
less than you think is the same fault class one level up. That is not what this one was.)

`packages/orchestrator` stays out and that is a DECISION with a prior record, not an unfinished
edge. `docs/research/bun-runtime-probe-2026-08-22.md` keeps it on Node for two measured reasons —
Bun runs it slower (29 s → 57 s) and `shell-test-executor.test.ts` asserts `NODE_TEST_CONTEXT` as a
precondition, which Bun does not set by design. No Stryker runner drives `node --test` with per-test
attribution, so covering it would mean converting the package to satisfy the instrument. The driver
names it whenever a branch touches it, so the exclusion is visible at the moment it costs something.

## 2. The extension is SHOWN to fail, on a control in the same run

A deliberately hollow test was written against a fixture module in `apps/studio/src/lib/`, and the
real rung was run against it three times. Only the TEST changed between runs 1 and 2; only an
equivalence annotation changed between 2 and 3. The fixture was removed afterwards; the three logs
are the evidence.

The subject:

```ts
export function clampGrowth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
```

**Run 1 — the hollow test.** Every assertion holds for any implementation returning a `number` that
happens to be the identity on `0.5`. It covers the module and discriminates nothing:

```ts
const out = clampGrowth(0.5);
expect(typeof out).toBe('number');
expect(out).toBeGreaterThanOrEqual(0);
expect(out).toBeLessThanOrEqual(1);
```

```
[mutation-diff] [1/2] bun runner over 1 file(s) in packages/cli, witnessed by 1 test file(s)
[mutation-diff] [2/2] vitest runner over 1 file(s) in apps/studio, witnessed by 1 test file(s)
[mutation-diff] 2 changed source file(s), 4 changed line span(s), 66 mutant(s) counted
[mutation-diff]   SURVIVED apps/studio/src/lib/growthClampDemo.ts:3 [BooleanLiteral]
[mutation-diff]   SURVIVED apps/studio/src/lib/growthClampDemo.ts:3 [ConditionalExpression]
    … 11 survivors in the studio file …
EXIT=1
```

**Run 2 — the strengthened test**, cases that discriminate each branch. Studio survivors **11 → 2**.
The two remainders are the `<`→`<=` and `>`→`>=` mutants, which are genuinely EQUIVALENT: at
`value === 0` the strict form falls through to `return value`, which is `0`, and the loose form
returns `0` directly. Same output, so no test can kill them.

**Run 3 — the two equivalents annotated.** Studio survivors **2 → 0**; the studio arm is clean and
the rung's remaining reds were all in `packages/cli` (this branch's own new code, since fixed).

**11 → 2 → 0 across three runs of the same fixture is the demonstration.** The threshold is read off
a control in the same run rather than off a number anyone picked: run 1 says the rung reds on a
hollow studio test, run 3 says it goes green when the tests are real, and run 2 is the middle that
shows the count tracking test strength rather than tracking nothing.

## 3. Cost — small, and only on branches that touch a vitest project

Measured on this box (12 cores), Stryker `concurrency: 4`:

| what | mutants | witness tests | wall |
| --- | --- | --- | --- |
| `worldStatus.ts` + `activity.ts`, WHOLE files (115 + 114 lines) | 101 | 38 | **9.4 s** |
| `DetailDisclosure.tsx` (React, jsdom) + `format.ts`, whole files | 51 | 4 | 7 s |
| the demo fixture, whole file | 12 | 1 | 3 s |

A branch that touches no vitest project adds **one extra Stryker run: zero**, because no vitest group
is planned at all. A branch that touches one adds a run of the order of ten seconds. This is work
that did not happen before — the same branch previously printed `NARROWED` and mutated nothing there
— so it is new cost buying new coverage, not a slowdown of existing work.

⚠ **One cost shape to recognise.** A module doing real I/O with retries produces Stryker TIMEOUTS,
each costing the full `timeoutMS` (60 s). Mutating `server/codeStamp.ts` — which spawns `git` and
retries with backoff — cost 1 m 44 s for 40 mutants, of which 5 were timeouts on the retry loop.
This is a property of the SUBJECT, not of the vitest runner (the bun arm behaves identically), and
it does not arise for the `src/` modules the rung actually selects. Note that `server/**` is out of
scope anyway: the rung only mutates files under a project's `src/`.

## 4. Two traps that cost the wiring, both now encoded in the generated config

1. **`vitest.related` must be `false`.** By default the runner asks vitest `--related <mutated
   files>`. The mutate paths are repo-root-relative while the project's vitest root is the project
   dir, so vitest matches nothing and the dry run reports `No tests were found`, aborting the rung.
2. **`root` must be pinned to the project directory.** Vitest resolves `root` from the CWD, which
   under Stryker is the SANDBOX root, *not* the config file's directory. Without pinning it, the
   project's own `include` globs (`src/**`) resolve against the repo root and match nothing — the
   same symptom as trap 1, from a different cause.

The generated vitest config **extends the project's own config** rather than restating it, so the
React plugin, the `self`→globalThis setup file and the 60 s timeout come along and cannot drift. A
function-form config (`defineConfig(() => …)`) is refused loudly rather than silently producing a
config with no `include`, which vitest would run as "the whole suite".

## 5. The correctness hazard the merge had to disarm

Driving more than one runner means more than one Stryker run, and **Stryker numbers test ids from
zero WITHIN each run**. Two runs therefore both contain a test `"0"`, in different projects. The
adjudicator builds ONE `id → file` map from the merged report, so a naive merge silently overwrites
the first run's `"0"` — and every mutant it recorded as `killedBy: ["0"]` is attributed to a file in
the OTHER project.

The failure is not a crash. The mutant still resolves to *a* test file, so it is scored `proven` or
`killed-by-others` against the wrong ownership question, and a mutant killed only by an unchanged
test in project A can be credited to a changed test in project B **and pass**. That is this repo's
standing fault class wearing a new hat.

`mergeMutationReports` namespaces every id as `<group>::<id>`. The unit test for it was itself
verified to fail: reverting the brand to the identity function reds
`mergeMutationReports: colliding test ids across runs do NOT cross-attribute` and nothing else.

## 6. What this does NOT claim

- It does not cover `packages/orchestrator` (§1).
- It does not cover `apps/studio/server/**` or any file outside a project's `src/` — a pre-existing
  rule of the rung, unchanged here.
- It does not fix `mutation-rung-unproven-reds-only-on-ci` (the friction where the rung passes
  locally and reds on CI as UNPROVEN). That defect lives in the vendored bun-runner patch's
  `resolveKilledBy`, is documented in `docs/research/stryker-bun-attribution-2026-08-26.md`, and is
  untouched. Worth noting for whoever picks it up: the vitest runner resolves test ids natively and
  does **not** share the defect, so the vitest arm added here cannot reproduce it.
