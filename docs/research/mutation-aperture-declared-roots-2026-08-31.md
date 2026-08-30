# Should `check:mutation-diff` mutate a project's declared test roots outside `src/`?

**Measured 2026-08-31 · `unscored-guards-arc` / `mutate-declared-test-roots` · ANSWER: NO — under
any of the three shapes. Naming the gap is enough.**

**Read this before proposing the widening again. Do not re-run the sweep** — it costs ~50 minutes of
Stryker wall clock and the result is not close.

---

## The question

`check:mutation-diff` mutates only files under `<workspace-project>/src/`. A project's `test` script
may declare suite roots OUTSIDE that — and where it does, the rung already says so, printing
`NARROWED (GAP)` instead of a plain `NARROWED`. The open question was whether to close that gap by
mutating declared roots too.

**Correct one thing first, because the increment that commissioned this got it wrong and so did the
briefing.** Naming suite roots in a `test` script does NOT widen the aperture. `selectMutationTargets`
drops every changed file outside `${owner.dir}/src/` unconditionally
(`packages/cli/src/mutation-diff.ts:681`); `declaredTestRoots` feeds only the drop's KIND LABEL. The
script roots buy HONESTY in the report, never coverage.

## Three declared non-`src/` roots, not two

Every workspace `test` script was scanned. Exactly three declare a suite root outside `src/`:

| project | `test` script | declared root |
|---|---|---|
| `packages/forest-world-r3f` | `bun test … src/ harness/` | `harness/` |
| `apps/studio` | `vitest run src/ server/` | `server/` |
| `apps/desktop` | `bun test … src/ electron/` | `electron/` |

The increment named only the last two. `harness/` is the largest (77 non-test files, 28,862 lines)
and the most touched.

**Census — 200 first-parent merges on `origin/main`,** counting merges that changed a non-test
`.ts`/`.tsx` under each root:

| root | merges |
|---|---|
| `packages/forest-world-r3f/harness/` | 30 |
| `apps/studio/server/` | 17 |
| `apps/desktop/electron/` | 4 |
| **any of the three** | **48 of 200 (24.0%)** |
| *control:* `packages/cli/src/` (a root that IS mutated) | 88 |

The control is what separates "the walk found nothing" from "there is nothing". Independently
reproduced twice, by two sessions, with matching per-file rankings (`apiRouter.ts` 11,
`IslandView.tsx` 9, `shipped-land-scene.ts` 6).

## Method

The rung's shape has changed since these branches landed, so running each branch's own contemporary
rung would have measured old rungs. Instead **today's rung, relaxed, was replayed over each
branch's own diff**:

1. In a scratch worktree at today's `origin/main`, relax the drop so a file inside a project's
   declared test roots is mutated rather than narrowed. The patch is hidden from git with
   `git update-index --skip-worktree`, so it never enters the diff under test.
2. For each sampled PR, stage the PRE-merge state of the roots as one commit and the POST-merge
   state as another, then create a merge commit whose parent 1 is the PRE commit.
3. Run with `GITHUB_EVENT_NAME=pull_request`, so `chooseBaseRef` resolves the base to `HEAD^1` —
   exactly the ref CI uses. The rung then sees precisely that PR's own diff, with every other
   package at today's code.

**One instrument defect was found and fixed mid-run, and anyone repeating this will hit it.** The
`exemptFiles` check sits BELOW the `src/` drop, so admitting a file at the drop site and
`continue`-ing jumps it. Mirror probes live under `apps/studio/server/`, so `traversalMirrorProbe.ts`
came back with 18 survivors that were pure artifact — the real rung exempts it via
`entryPointsFromMirrorRegistry`. Any relaxation must re-ask the exemption at the new admission
point. The batch was discarded and re-run after the fix.

## Result

Eleven branches sampled. **Eight produced a usable verdict, and all eight are RED.** Three are
inconclusive and are reported as such, not as findings: two desktop samples (08-22, 08-23) whose
Stryker dry run failed on tests unrelated to the mutation — replay drift from putting an old
`apps/desktop/src/` on today's `main` — and one harness sample whose dry run timed out.

The control column is the whole result:

| region | mutants | killed | survived | no-coverage | timeout | **UNKILLED** |
|---|---|---|---|---|---|---|
| `<project>/src/` — today's aperture | 865 | 818 | 0 | 0 | 0 | **0 (0.0%)** |
| declared roots — the widening | 1,109 | 220 | 186 | 701 | 2 | **889 (80.2%)** |

Same branches, same runs, same bar. Inside the current aperture these branches' own tests killed
**everything the rung asked about**. In the newly-admitted region they killed one fifth.

Per file:

| file | sibling test | mutants | unkilled |
|---|---|---|---|
| `harness/palette-measure.ts` | no | 438 | 100% |
| `harness/shipped-land-scene.ts` | **yes** | 263 | 100% |
| `server/forestSnapshotCli.ts` | no | 60 | 100% |
| `server/apiRouter.ts` | no | 42 | 100% |
| `electron/backend-entry.ts` | no | 2 | 100% |
| `harness/palette-transcription.ts` | yes | 181 | 33% |
| `server/forestSnapshot.ts` | yes | 65 | 32% |
| `harness/kit-vocabulary.ts` | yes | 4 | 25% |
| `server/contextWindowsApi.ts` | no | 16 | 19% |
| `harness/shipped-baseline.ts` | yes | 38 | 0% |

## Why each of the three shapes fails

**Blanket widening — refuted.** 80.2% unkilled, and every sampled branch reds. The `src/`-only
drop's stated reason ("failing wide would mutate code no unit test is written against, every mutant
would survive, and the rung would red honest landings") turns out to hold for declared roots too.

**Per-root opt-in — refuted, and this is the option the increment expected to win.** It predicted
`electron/` would be dominated by unkillable-by-design and `server/` by genuine coverage gaps. The
data says the split is not per-root at all: every one of the three roots mixes 100%-unkilled modules
with modules that behave like `src/`. `server/` holds `apiRouter.ts` (42/42 unkilled) beside
`contextWindowsApi.ts` (19%); `harness/` holds `palette-measure.ts` (438/438) beside
`shipped-baseline.ts` (0%). No per-root rule can separate them.

**Per-file witness gate — refuted, with a number.** Admitting a declared-root file only when
`siblingTestFor(file)` exists takes 80.2% unkilled to **62.4%** — still far past anything that could
gate a merge. The reason is visible in the table: `shipped-land-scene.ts` HAS a strict sibling test
and is 263/263 unkilled, because the rung runs only the branch's OWN CHANGED tests and that branch
changed the source without changing the sibling. Sibling-test existence is a property of the
repository; what the rung actually asks about is a property of the branch, and the two do not line
up. The gate would also still exclude `apiRouter.ts`, the file the arc charter names as the reason
the gap matters at all.

## Why the reds are not simply the truth being told

75–80% unkilled is partly a true report: these directories genuinely are unproven. What decides the
question is whether the rung's verdict leaves the branch author an ACHIEVABLE action. Inside `src/`
it does, and 818/818 kills say branches routinely take it. For a 42/42 no-coverage change to a
2,305-line router that this repo has deliberately tested through integration tests, the implied ask
is a redesign, delivered as a red gate on an unrelated landing. That is the "instrument that cannot
PASS" failure the rung's own comment-only and narrowed-to-nothing branches exist to avoid.

Note the dominant status is **`NoCoverage` (701 of 889), not `Survived`** — the branch's own changed
tests never reach these lines at all. That is not a test-strength finding; it is the diff-scope of
the rung meeting code whose tests are not written per-branch.

## What stands instead

Nothing changes. The rung keeps mutating `<project>/src/` only, and keeps printing
`NARROWED (GAP)` for a declared root it could see and did not mutate — which is what makes the hole
visible rather than silent, and is the outcome the increment named as legitimate.

The **DIFF-SCOPE** blind spot named by `unscored-guards-arc` is untouched by any of this and remains
the open one: the rung only ever asks about lines a branch changed, so a standing hole no branch
touches is invisible however wide the aperture. That is a separate decision with its own cost.

Related: agent-memory `mutation-rung-aperture-is-src-only-per-project`,
`mutation-rung-scores-a-hang-as-unproven`; ADR-0458 (`diff-scoped-mutation-rung`).
