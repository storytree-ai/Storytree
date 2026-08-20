---
status: accepted
amends: [195, 304]
decided: 2026-08-20
arc: the-gate-costs-what-the-change-risks-arc
---
# ADR-0394: A root path with proven readers narrows the affected scope; every other path still fails wide

## Status

accepted (2026-08-20) — the fork was directed by the owner on 2026-08-20 when he chartered
`the-gate-costs-what-the-change-risks-arc` and told a session to drive it. The arc's end state 1
states this decision in as many words: *"A change confined to paths whose readers are KNOWN no longer
buys the full monorepo run… It still fails WIDE for genuinely unmapped paths."* Design-time alignment
IS the ratification (ADR-0110); no second end-of-flow ask. What the owner directed is the DIRECTION.
What this session decided, and what the rest of this ADR is accountable for, is the specific map and
the standard of evidence behind it.

## Context

[ADR-0195](0195-affected-only-pr-test-scope-ci-cost-scales-with-the-change-n.md) built the
affected-scope classifier and made it deliberately conservative: any file the pnpm dependency graph
cannot see forces the full `-r` run. [ADR-0304](0304-the-gate-measures-what-a-change-affects-and-the-queue-does-t.md)
D1 put that same classifier behind the LOCAL `pnpm gate`, and D2 fixed one shared implementation so a
local pass keeps predicting a CI pass.

Fail-wide is the right default and this ADR does not weaken it. The defect is narrower: the
classifier charges the full monorepo for paths whose readers are *few and knowable*, and it does so
because nobody has ever measured them — not because measuring them was tried and failed.

**What it costs, measured rather than argued.** On PR #1438 (2026-08-20, session
`jovial-moser-923cfb`), a single ADR body edit — one file, no code — classified
`[ci:affected] mode=full … outside the workspace dependency graph`, rendered `pnpm args: -r`, and ran
25 of 26 workspace projects. The local `pnpm -r --no-bail test` step alone took **14m29s**, because
six other sessions were running full gates on the same 12-core box; the gate's liveness meter
recorded 7.7s of CPU across 7 processes in 60s, roughly 1% of the machine, sustained for fourteen
minutes. CI did strictly more work in 6m40s on a hosted runner. This repo carries 391 decision
documents and generates them continuously, so *every* branch that records a decision pays this —
which is exactly the friction item
`an-adr-bearing-branch-forfeits-scope-narrowing-and-pays-the-flakiest-gate`: design work forfeits
narrowing and therefore pays the widest and most environment-sensitive gate.

**Why this cannot be settled by reading the code.** An under-selection here is a PR merging untested,
and the failure is silent — so the reader set is the one input that must not be guessed. It was
guessed for years, and the guess in ADR-0195's own header (*"the adr-health gates over
docs/decisions"*) is incomplete: `packages/drive` also reads the tree at test time, and nothing in
drive names the path. `chain-claims-drive.test.ts` stages a fixture story dir in `os.tmpdir()` and
calls `storyBuild`, which resolves `loadAdrMetas(rootDir/docs/decisions)` against the REAL repo root
because the test does not inject `repoRoot`. A grep for the literal path does not find it. Had this
ADR shipped the grep's answer, it would have under-selected.

**So the map was measured at the filesystem layer.** Every `node:fs` read was wrapped via
`NODE_OPTIONS=--import` (so the wrapper reached every process pnpm spawns), `pnpm -r --no-bail test`
was run across all 25 workspace projects on a quiet box, and every read resolving inside the real
`docs/decisions` tree was logged with its owning process. Result: **two packages, and no others** —
`@storytree/cli` (`adr-health.test.ts`, `cli.test.ts`, `story-build.test.ts`) and `@storytree/drive`
(`chain-claims-drive.test.ts`). The two vitest suites, `apps/studio` and `packages/app-surface`,
short-circuited on an artefact of the probe itself and were therefore re-probed separately with it
fixed — 149 and 20 test files, all green, zero reads of the tree. `apps/studio` is selected anyway as
a dependent of `@storytree/drive`; `packages/app-surface` is not in that closure, which is why its
re-probe was necessary rather than tidy.

## Decision

**D1 — a root path narrows only when its readers have been MEASURED.** `ci-affected.ts` gains
`ROOT_PATH_READERS`, an explicit list of root-path prefixes mapped to the workspace projects whose
test suites read them. A changed file outside the workspace graph that matches an entry selects that
entry's projects (plus their dependents, which is pnpm's `--filter ...<name>` job) instead of forcing
the full run. It carries one entry today: `docs/decisions/` → `@storytree/cli`, `@storytree/drive`.

**D2 — everything else is unchanged, and that is most of the classifier.** A root path with no
measured reader set is not in the map and still forces `mode=full`: `stories/**`, `scripts/**`,
`.github/**`, `docs/` outside `docs/decisions/`, the lockfile, root tsconfig, `CLAUDE.md`, the `web`
gitlink. So do any `package.json`, `apps/studio/data/**`, a file under `packages/`/`apps/` owned by
no project, an empty change set, and an unreadable `origin/main`. This is an exception to the ANSWER
for one path, never an exception to the burden of proof.

**D3 — a stale map fails WIDE, mechanically.** The map names package NAMES, so a rename could leave
it selecting fewer projects than it claims — an under-selection that reads as a successful narrowing.
The classifier therefore checks every name in a matched entry against the discovered workspace and
returns `mode=full` naming the missing project if any is absent. A real-repo test asserts the map
still resolves to exactly its two readers, so a rename reds the gate rather than quietly shrinking it.

**D4 — one classifier, both surfaces, including the narrowing.** ADR-0304 D2 is unchanged and this
decision is inside it: `pnpm gate` and CI both narrow, because both call `classifyChangedFiles`. The
local gate's own test file pins the narrowing as well as the FULL triggers — a local implementation
that hard-coded `docs/** → FULL` would agree with CI on every existing assertion while disagreeing on
the one path that now narrows, and a local gate that runs MORE than CI is the failure that hides,
because it never reds anything.

**D5 — adding an entry costs a measurement, not an argument.** Extending the map to another root path
(`stories/**` is the obvious candidate, and is NOT done here) is an amendment to this ADR and
requires re-running the fs-level probe for that path. If a path's readers cannot be established
mechanically, it stays fail-wide — that is a result, not a failure.

## Consequences

**Good.** A decision-only branch narrows from **25 of 25** workspace projects to **9** —
`@storytree/cli` and `@storytree/drive` plus their dependents (`arc`, the three
`context-traversal-*` packages, `desktop`, `studio`). The saving is paid twice on one landing,
locally and on every PR, because the classifier is shared. Proven on this ADR's own branch, which
carries a decision file and now reports:
`scope: AFFECTED — @storytree/cli, @storytree/drive plus dependents (all 4 changed file(s) map to workspace projects (1 via the root-path reader map))`.

**Honest about the size of the win.** 9 of 25 is not 1 of 25, and the heaviest suites — `cli`,
`studio`, `desktop` — are all inside the narrowed set, because `@storytree/drive` sits low in the
graph and drags its dependents in. The remaining 16 projects are the cheap leaves. Anyone reading
this as "an ADR edit is now nearly free" has read it wrong; what it removes is the 16 projects that
were never going to observe the change, not the cost of the ones that might.

**Bad, and accepted.** The map is measured evidence with a shelf life. A future test that reads
`docs/decisions` from a package outside the map would be under-selected, silently, until something
else caught it. Three things bound that risk and none is a new gate rung: D3 reds on a rename;
`@storytree/drive` sits low enough that most new readers land inside its dependent closure anyway;
and ADR-0195's dispatched full-suite backstop run on `main` after every landing catches an
under-selection minutes later. The re-derivation procedure is recorded in `ROOT_PATH_READERS`' own
comment precisely so a later session re-measures instead of re-guessing.

**What this deliberately does not do.** It does not cap, throttle, queue or admission-gate concurrent
gate runs — refused by the owner on `session-decoupling-arc`, where every remedy REMOVED coupling and
none throttled dispatch. It adds no guard a legitimate change must argue with or override
(ADR-0352): the honest case sees a shorter run and no prompt. It does not re-propose a merge queue
(declined, ADR-0362) and does not re-measure the CI landing tail (settled, ADR-0345). The direction
is forced and unchanged: make a gate CHEAPER, never make gates FEWER.

**Interaction worth stating.** The `check:*` rungs are not scoped by this classifier at all — they
run unconditionally in both `gate-order.ts` and `ci.yml`. So `check:web-grounding`, which also reads
`docs/decisions`, is unaffected by the map and correctly has no entry in it. This narrows the
compile-and-test legs only; it silently deletes no policy check.

## References

- `the-gate-costs-what-the-change-risks-arc` — the owning arc, carrying the intent and the fences;
  increment `the-gate-costs-what-the-change-risks-arc-inc-01` is this work.
- ADR-0195 — built the classifier and its conservative rules; this amends the "any root path → FULL"
  rule for one measured path and leaves the rest intact.
- ADR-0304 — D1 put the classifier behind the local gate, D2 requires one shared implementation; this
  narrows what D1 selects and stays inside D2.
- ADR-0345 — the landing-tail measurement; the precedent for making a gate step cheaper
  (`check:agents`, 3.22 min to 0.32 min) rather than running it less often.
- ADR-0352 — no guard the honest case must override; why this adds no prompt and no opt-out.
- ADR-0362 — the merge queue, declined; not re-proposed here.
- `packages/cli/src/ci-affected.ts` — `ROOT_PATH_READERS` and the classifier.
- `packages/cli/src/ci-affected.test.ts`, `packages/cli/src/gate-scope.test.ts` — the narrowing and
  its fail-wide guards, pinned in both directions.
- `an-adr-bearing-branch-forfeits-scope-narrowing-and-pays-the-flakiest-gate` — the friction item this
  closes.
