---
status: accepted
decided: 2026-08-21
arc: the-gate-costs-what-the-change-risks-arc
amends: [394]
load_bearing: true
---
# ADR-0399: The reader map covers the guidance projections, and a zero-reader path is mapped up rather than to an empty scope

## Status

accepted (2026-08-21) — the owner directed driving `the-gate-costs-what-the-change-risks-arc` to a
close, and this is increment 5's own decision. ADR-0394 already decided the MECHANISM and set the
price of admission: "adding an entry is an ADR-0394 amendment, and it costs a measurement, not an
argument." This is that amendment. What genuinely needed deciding — and is decided in D3 — is the
expressiveness gap increment 5 named: whether a root path with no measured readers should be
expressible as an EMPTY scope.

## Context

ADR-0394 landed the root-path reader map with ONE entry, `docs/decisions/`. Increment 5's job was to
extend it on the same evidence standard, and to close the gap that a path measured to have zero test
readers could not be expressed and collapsed back to the full run.

The motivating case was this arc's own increment 3: a **CLAUDE.md-only change**, twenty-four inserted
lines of guidance and no code, whose gate reported `scope: FULL (every package) — CLAUDE.md: outside
the workspace dependency graph` and bought all 25 projects.

### The measurement

The same probe ADR-0394 used, widened: every `node:fs` read wrapped through `NODE_OPTIONS=--import`
so the wrapper reaches every process pnpm spawns, `pnpm -r --no-bail test` run across all 25
workspace projects, and every read resolving outside `packages/`/`apps/` attributed to its owning
project. Where ADR-0394 probed ONE guessed prefix, this run recorded the whole root surface at once,
so the entries below are a census rather than a sample. All 25 projects ran GREEN, both vitest suites
included — a suite that short-circuits reads zero and is UNOBSERVED, not clean, which is the trap
ADR-0394's own run hit and had to re-probe around.

What the census found, by root path (reads, distinct files, owning projects):

| root path | reads | reader projects |
|---|---|---|
| `stories/` | 5031 | studio, cli, context-traversal-capture, drive, library, model-uat-pilot, orchestrator |
| `docs/` (outside `docs/decisions/`) | 3 | cli, app-surface |
| `docs/decisions/` | 1959 | cli, drive |
| `tsconfig.base.json` | 964 | **26 of 26** |
| `scripts/` | 450 | **25 of 25** (every test script preloads `scripts/tsx-cache-off.mjs`) |
| `.claude/agents/` | 10 | cli |
| `.claude/settings*.json` | 5 | cli, drive |
| `.codex/` | 11 | cli |
| `.cursor/` · `.gemini/` · `.opencode/` | **0** | — |
| `CLAUDE.md` · `AGENTS.md` | 1 each | cli |
| `.github/` | 3 | cli, notice-board |
| `infra/` | 10 | cli, library |
| `repo-manifest.json` | 3 | drive |

### Counting projects flatters this, and increment 1 already had to learn that once

The value of an entry is the WORK it removes, not the project count. Summed per-project test
durations from the same instrumented run — 618.0s across 25 reporting projects, a work measure, so
box contention cannot distort it — expanded through `pnpm --filter ...<name>` exactly as the gate
would:

| what a diff selects | projects | test work | share |
|---|---|---|---|
| `@storytree/cli` alone | 1 of 26 | 214.4s | **34.7%** |
| cli + drive | 9 of 26 | 533.5s | 86.3% |
| the seven `stories/` readers | 14 of 26 | 591.0s | 95.6% |

So the entries differ by an order of magnitude in value, and the ranking is not what the reader
counts suggest. Nothing depends on `@storytree/cli`, so a diff selecting only cli expands to ONE
project — and that is the guidance-projection case.

### Churn, so the entries are ranked by what they are actually worth

Over the last 800 commits, by root path touched: `docs/` 1347, `stories/` 305, the five harness agent
directories 486 combined (`.codex/` 105, `.cursor/` 98, `.claude/` 98, `.gemini/` 95, `.opencode/`
90), `CLAUDE.md` 70, `AGENTS.md` 55, `repo-manifest.json` 33, `infra/` 13, `scripts/` 8,
`pnpm-lock.yaml` 8, `.github/` 6, `.gitignore` 1, `README.md` **0**.

## Decision

**D1 — Eleven entries, each measured.** The map gains `docs/`, `stories/`, `CLAUDE.md`, `AGENTS.md`,
`.claude/agents/`, `.claude/`, `.codex/`, `.cursor/`, `.gemini/` and `.opencode/` beside the existing
`docs/decisions/`. Fail-wide remains the default for everything else, unchanged.

**D2 — Matching is LONGEST-PREFIX-WINS and computed, and an entry without a trailing slash matches
EXACTLY.** Two pairs now overlap — `docs/decisions/` inside `docs/`, `.claude/agents/` inside
`.claude/` — and they name different reader sets, so a first-match-wins scan would hand a decision
file the wider set the day someone re-sorted the array. The exact-match rule is the same hazard one
level down: a `startsWith("CLAUDE.md")` would also claim `CLAUDE.md.bak`, narrowing a path nobody
measured.

**D3 — A path with ZERO measured readers is mapped UP to its writer, never down to an empty scope,
and the empty scope is NOT built.** Increment 5 asked for the gap to be closed by making "no test
project reads this" expressible. On the evidence it should not be, and the evidence is the point:

- An empty scope is a **second terminal state that runs nothing**, and its failure mode is a branch
  gating green having tested nothing. Today every bug, unmapped path and unreadable input lands on
  `-r`, so the fallback is always safe; adding a second terminus removes that property.
- The payoff is nil. Every root path with genuinely zero test readers — `README.md`,
  `.editorconfig`, `.env.example`, `.nvmrc`, `.gitattributes`, `.gitignore` — changed **at most once
  in 800 commits**, and `README.md` not at all.
- The three zero-reader paths that DO churn (`.cursor/`, `.gemini/`, `.opencode/`, 283 touches
  combined) never appear in a commit without `.claude/` or `CLAUDE.md` beside them, because all five
  projections are regenerated together. Mapping them to their writer, `@storytree/cli`, is
  OVER-selection and therefore safe, and it produces exactly the same union.

So the gap is closed by making the map's own guarantee stronger — **it can only ever select at least
one project** — rather than by adding a way to select none. A test asserts that property directly, so
a future entry written with `projects: []` reds rather than silently running nothing.

**D4 — Two measured paths are deliberately NOT mapped, and that is the more instructive half.**
`scripts/**` is read by 25 of 25 projects and `tsconfig.base.json` by 26 of 26 — an entry for either
would express the full run in a longer form. `.github/`, `infra/` and `repo-manifest.json` were
measured and left out too: each would narrow, but 6, 13 and 33 touches in 800 commits do not earn a
map entry's staleness risk. A map is not improved by having more entries in it.

**D5 — The classifier stays SHARED (ADR-0304 D2), and the local gate's narrowing is pinned as well as
CI's.** One implementation, both surfaces. The gate-scope suite already pinned "the LOCAL gate
honours CI's FULL triggers"; its mirror now pins the guidance-regeneration narrowing too, because a
local gate that runs MORE than CI is the failure that hides — it never reds anything, it just costs.

## Consequences

**The commonest non-package change in the repo goes from 26 projects to one.** A guidance
regeneration — `CLAUDE.md`, `AGENTS.md`, and all five harness agent directories — selects
`@storytree/cli`, which nothing depends on: 214.4s of 618.0s, about 65% off the test leg, on 611
path-touches per 800 commits. This arc's own increment 3 is the case that motivated it.

**`stories/` saves little wall clock and is kept for a different reason.** Its seven measured readers
expand to 14 of 26 projects and 95.6% of the test work — a 4.4% saving, and the honest number to
quote rather than "14 of 26". It is kept because it removes twelve projects from the set that can red
a story-only branch. That matters on its own terms: this arc's increment 3 was redded by a
`storage-protocol` flake on a CLAUDE.md-only diff, and the whole twelve-step gate had to be re-run to
disprove it. A narrowing makes a verdict MEAN more as well as cost less.

**The map's staleness surface grew from one entry to eleven,** and the fence grew with it: every
entry is now exercised by a test that removes one of its readers and asserts the classifier fails
WIDE, so a package rename cannot leave any entry narrowing to a ghost. The standing rule is unchanged
and now matters more — adding an entry costs a measurement, not an argument.

**What this does NOT do.** No cap, throttle, queue or admission control on concurrent runs (refused
by the owner on `session-decoupling-arc`); no guard a legitimate change must argue with (ADR-0352);
and no test deleted, skipped, sampled or moved off the gate. The gate proves exactly what it proved
before on every path it still selects.

## References

- ADR-0394 — the reader map and its evidence standard; amended here, not superseded.
- ADR-0304 D1/D2 — fail-wide by default, one classifier shared by the gate and CI.
- ADR-0195 — the affected-scope rules the map is an exception to.
- ADR-0352 — fix the write, do not detect the outcome (why there is no override anywhere here).
- `packages/cli/src/ci-affected.ts` (`ROOT_PATH_READERS`, `readerMapEntryFor`) ·
  `packages/cli/src/ci-affected.test.ts` · `packages/cli/src/gate-scope.test.ts`.
