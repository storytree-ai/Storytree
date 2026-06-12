---
status: accepted
decided: 2026-06-10
---

# ADR-0031: A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees

## Status

accepted (2026-06-10). Closes the two parked owner decisions from PR #29 (promotion; worktree
`pnpm install`) per the owner's direction ("1 and 3 sound good"), and records the disposition of
the `verdict-line` bootstrap fixture ("clean it up or fold it into the system properly with design
notes in the ADR"). Builds on [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the
prove-it-gate), [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the PR/CI landing cadence) and
[ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the live leaf). Informed by a V1 research pass
over `legacy/Agentic` (read-only): V1 ADR-0013 (branch-per-session + gate-guarded merge ceremony),
V1 ADR-0014 (ancestry-walk signing check), and V1's full-workspace verification discipline.

## Date

2026-06-10

## Context

Phase F (`node build <id> --real`, PR #29) proved the drive: a live leaf authored a node's real
test/impl in a fresh git worktree, the spine observed the genuine red→green and signed a PASS.
But the proven commit was deliberately **evidence-only** — unreferenced after worktree cleanup.
Phase E (PR #30) then made verdicts persist (`--store pg` → `events.verdict`), which sharpened the
gap: the *receipt* survived, the *code* it attested did not.

V1 had no such state. Its rule (session-orchestrator process, `legacy/Agentic`):

> "A session that finishes its authoring work but leaves the session branch unmerged is not
> 'done holding a branch', it is unfinished."

V1's shape: every writer works on an isolated branch+worktree; a mandatory gate-guarded **merge
ceremony** lands the work at the end; a failed ceremony **preserves** the branch and escalates —
landed or preserved, never lost. Two V1 mechanics matter here:

1. **The ancestry-walk** (V1 ADR-0014): a signed verdict names the exact commit it tested; after
   a merge HEAD is a different commit, so the gate accepts a verdict attesting any **ancestor**
   of HEAD. This is what lets proven code merge without re-proving or forging.
2. **Full-workspace verification**: V1 always ran the entire `cargo test --workspace` — a green
   leaf was never allowed to silently break the code around it.

Two V1 choices do **not** carry: V1 merged locally with no PRs by default (V2's ADR-0022
deliberately routes landing through the GitHub PR/CI gate), and V1 rewrote `status: healthy` into
the spec file (V2's ADR-0020 deliberately derives health from signed verdicts — the file stays
`proposed` forever).

Separately, the worktree's iteration-one constraint — no `pnpm install`, builtins-only targets —
limited REAL builds to net-new dependency-free leaves. V1 never had that restriction (cargo gave
every test run the full crate graph); its cost was cold compilation per worktree, which it simply
accepted. V2's equivalent cost is far smaller: pnpm's shared content-addressable store makes a
fresh-worktree install mostly hard-links (measured in this repo: **3.2 s** for the full
360-package workspace).

## Decision

### 1. Promotion: branch-per-pass, landing rides the ADR-0022 PR/CI gate

On a signed REAL **pass**, the spine immediately parks the proven commit on a branch —
`claude/real/<unit-id>-<run-id>` (runId-suffixed: a retried build never collides) — and pushes it
to `origin` when one exists (`promoteRealPass`, `packages/orchestrator/src/build-worktree.ts`).
Landing is then a PR through the existing CI green gate; nothing merges around the gate.

- **The branch tip IS the verdict's `commitSha`** — the exact commit the proof ran against,
  byte-for-byte. Promotion never rebases, squashes, or amends.
- **Non-squash merges only** for promotion PRs (merge commit or fast-forward). A squash mints a
  new sha and orphans the persisted verdict's anchor; with a true merge the attested commit stays
  an **ancestor of `main`** — V1's ancestry-walk rule, V2-shaped: *a verdict is honored as long
  as the commit it attests is reachable from HEAD.*
- **Preservation over loss** (V1's failed-ceremony rule): a push failure keeps the local branch
  and reports; nothing is deleted on any failure path. A pass where nothing was authored (the
  verdict attests the unchanged HEAD) skips promotion explicitly.
- The CLI surfaces the branch and the `gh pr create` follow-up in the build envelope. Opening the
  PR automatically is deliberately left to the operator/session for now (one decision per landing,
  same as every other branch in the merge-when-green cadence).

### 2. Dependency-bearing worktrees: lockfile-only install + a package regression wall

`RealProofConfig` gains `install?: boolean`. When set, the worktree gets
`pnpm install --frozen-lockfile --prefer-offline` before the leaf enters (failure tears the
worktree down — a half-installed workspace must not look buildable), and the leaf brief tells the
truth about available imports.

- **The leaf can never add a dependency.** The write walls are allowlists (deny-by-default), so
  `package.json` / `pnpm-lock.yaml` are unwritable in every phase. V1's slow-growth rule carries
  forward: a new dependency is explicit story work, never a leaf's workaround. The brief says so.
- **The package regression suite guards promotion** (V1's full-workspace baseline, adapted to
  package grain): for installed worktrees, after the signed pass the spine re-observes the node's
  registered package suite in the worktree (same honesty floor: exit code only, `NODE_TEST*`
  scrubbed). A red suite keeps the promotion branch **local-only** (preserved for forensics,
  never pushed as a landing candidate) — a green leaf must not break its package. The verdict
  itself stands either way: it attests the node's proof, not the package's; the suite gates
  *landing*, not *truth*.
- Builtins-only (no-install) targets remain the default and skip the regression run — their proof
  command is their package surface.
- Windows mechanics: `pnpm` is a `.cmd` shim `execFile` cannot spawn; `platformShellCommand`
  wraps it as `cmd.exe /d /s /c pnpm …` (injection-safe arg vector, no shell string).

### 3. `verdict-line` disposition: folded in properly (the owner's "junk must not become noise")

`verdict-line` was the Phase F guinea pig — a tiny net-new pure function chosen so the gate's red
would be genuine. Proven once (signed PASS, run `real-mq7ky4ck`, persisted to `events.verdict` at
commit `0e8f4ba`), its code then evaporated by design while its spec/registry entries stayed —
exactly the junk-becomes-noise risk the owner flagged. Disposition: **fold in, by promotion**:

- The exact proven commit `0e8f4ba` was merged into the integration branch unmodified (a manual
  walk of §1's mechanism, predating its implementation), so the persisted verdict's sha remains a
  true ancestor of `main` after a non-squash merge.
- The function is now a real system citizen: exported from `@storytree/core`, consumed by the CLI
  node-build envelope (which previously formatted its verdict line inline — the spec's named
  motivating consumer).
- **Placement** (the PR #29 parked call): `stories/drive-machinery/` gets a minimal honest
  `story.md`, and `verdict-line.md` stays under it as a file-per-unit spec. The V1 lesson adopted:
  machinery is **ordinary work in the ordinary tree** (V1's UAT signer was story 1, flat among
  domain stories — no special meta-corner). The seed's contracts-inline convention stands for
  authored capability files; **file-per-unit is the registered-buildable grain** (the drive loads
  one spec file per buildable node), and that distinction is now written down rather than parked.
- The offline REAL-walk test recreates the net-new precondition by deleting the now-landed files
  in its worktree first — documenting that a REAL target must not exist at HEAD *at build time*,
  which is a per-run precondition, not a permanent property of the node.

### What this deliberately does not import from V1

- **No local-merge ceremony**: landing goes through ADR-0022's PR/CI gate, not a local `--ff-only`
  into `main`. (V1's "never bypass the gate" survives; the gate moved.)
- **No status rewriting**: nothing ever writes `healthy` into a spec file. Health stays a
  projection of signed verdicts (ADR-0020 / Phase E) — promotion lands *code*, never *status*.
- **No full-monorepo verification per node**: the regression wall is package-grain (the registered
  suite), not `pnpm -r test` — V2's per-node proof commands are finer-grained than cargo allowed
  V1, and CI still runs the whole gate on the landing PR.

## Consequences

- A REAL pass now has exactly three honest endings, all visible in the build envelope: **promoted
  & pushed** (PR-ready), **parked locally** (no origin / push failed / regression red — preserved,
  named), or **skipped** (nothing authored). The evidence-only fourth state is gone.
- Repo settings should disallow squash-merge for `claude/real/*` PRs (or reviewers must pick a
  merge commit) — recorded here as the operating rule; enforcement automation is later work.
- REAL targets are no longer limited to dependency-free leaves: a registry entry with
  `install: true` can name files that import workspace packages, which unlocks REAL builds for
  the feedback-graduation story's nodes (the first feature story authored after this ADR, as
  `notice-board`; renamed 2026-06-11 — the name moved to the session-presence story, ADR-0033).
- Chaining promotion through `story build --real` (one branch per story run vs per node) is named
  future work, not designed here.
- Offline coverage: promotion (fixture repos, bare-origin push, withheld push), install seam
  (injected runner, fail-closed teardown), platform shim — all in
  `packages/orchestrator/src/build-worktree.test.ts`; the live `pnpm install` path is exercised
  by real use, not by the offline suite (it would hit the network/store).

## References

- PR #29 (Phase F — REAL builds; the parked decisions 1–3), PR #30 (Phase E — verdict
  persistence; `--store pg`).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (proof is non-authorable),
  [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the landing gate),
  [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the live leaf).
- V1 (`legacy/Agentic`, read-only): ADR-0013 branch-per-session isolation; ADR-0014 ancestry-walk
  signing; `agents/orchestration/session-orchestrator/process.yml` (the merge ceremony, the
  preservation rule); root `Cargo.toml` (the slow-growth dependency rule).
- `packages/orchestrator/src/build-worktree.ts` (`promoteRealPass`, `runRegressionSuite`,
  `platformShellCommand`, install seam); `packages/cli/src/node-build.ts` (the wiring + envelope);
  `stories/drive-machinery/` (the story home this ADR settles).
