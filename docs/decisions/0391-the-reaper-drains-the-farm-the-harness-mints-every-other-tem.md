---
status: accepted
decided: 2026-08-20
arc: worktree-reaper-eligibility-arc
amends: [387]
---
# ADR-0391: The reaper drains the farm the harness mints; every other temp worktree is drained by whoever mints it

## Status

accepted (2026-08-20) — settled by measurement, as the increment that chartered it directed. The
`worktree-reaper-eligibility-arc-inc-02` increment named three options and said in its own body to
"start by MEASURING rather than choosing… the answer probably picks the option". It did. This
records which option the measurement picked and why the other two were refused, so the next census
does not re-derive the surprise.

## Context

ADR-0387 fixed the reaper's idle CLOCK. This is the other half of the same arc: the reaper's
UNIVERSE.

`gatherSnapshots` filters every candidate through `underManaged`, a prefix test against
`.claude/worktrees/`. Measured 2026-08-19, `git worktree list` reported 37 worktrees plus the
primary while the reaper's universe was 20. The other 17 were reaped by nothing. No ledger recorded
them, `worktree drain` did not count them, and no threshold ever aged them out. They were never
eligible or ineligible — they were never LOOKED AT.

Re-censused 2026-08-20, the population outside the managed dir was far larger than the sample that
first surfaced it:

| class | count | files | size | oldest |
| --- | --- | --- | --- | --- |
| `%TEMP%/storytree-real-*` REAL-build parents | 59 | 188,043 | **6.6 GB** | 2026-07-04 |
| `%TEMP%/storytree-real-chain-*` drive fixtures | 182 | 797 | ~0 | 2026-07-12 |
| `~/.codex/worktrees/*` | 39 | — | — | 2026-07-24 |
| `C:\code\storytree-*` sibling checkouts | 3 | — | — | — |

Two facts from that census decide the whole question.

**First: NONE of the 241 temp trees was registered.** `git worktree list` knew about none of them.
So they are not crashed builds holding a live registration — they are the residue of teardowns that
half-succeeded. `dropWorktree` runs `git worktree remove --force` (which succeeded: the registration
is gone) and then `removeDirBestEffort(parent)`, which swallows a Windows file lock it could not
outlast. 24 of the 59 parents are EMPTY — the recursive delete got everything except the final
rmdir. The other 35 kept their contents, four of them 1.1–1.4 GB of `node_modules`.

**Second: the code already delegated this residue, and the delegation landed nowhere.** The doc
comment on `dropWorktree` said entries orphaned this way "are left for the deliberate reaper
(`storytree worktree prune`)". That reaper's universe is `underManaged`, which a path under the OS
temp dir can never satisfy. Two files each believed the other owned the residue, and 6.6 GB
accumulated over seven weeks in the gap.

The forcing question the increment raised against simply widening `underManaged` is real: a
`%TEMP%/storytree-real-*` tree is created by the promotion path, and reaping one mid-build would
destroy a run in flight. The reaper's safety argument is merged + clean + unclaimed + idle, and
three of those four are meaningless for a detached temp tree that is on no branch and holds no
claim. Its basename is not a session id either, so ADR-0033's identity trick does not apply.

## Decision

**The rule is OWNERSHIP, not location: the reaper drains the farm the harness mints, and every other
temp worktree is drained by whoever mints it.** `underManaged` stays exactly as it is.

1. **The REAL-build path drains its own residue.** `sweepStaleBuildWorktrees` (in
   `@storytree/orchestrator`, beside the code that cuts the trees) removes `storytree-real-*` trees
   under the OS temp dir, and **every `createBuildWorktree` mint runs it**. Each mint clears the
   residue of the mints before it, so the temp farm is bounded by the sweep rather than by whether
   the last teardown happened to win its race with a file lock.

   Its safety rules, in the order they bind:

   - **A tree git still TRACKS is never swept.** A build in flight registers with `git worktree add`
     before anything else runs, so registration is the one liveness signal this class actually has.
     A parent is protected by its `wt` child's registration.
   - **Nothing inside the 48 h idle threshold is swept** — the reaper's own default. That covers a
     concurrent build that has already dropped its registration, and a long test run holding a
     fixture repo.
   - **Failure is swallowed and the work is CAPPED (4 per mint).** A sweep that threw would turn
     housekeeping into a build failure; an uncapped one deleting a 1.4 GB tree would stall a mint.
     Whatever the cap leaves, the next mint takes.

   The direction of the remaining hazard is deliberate: an mtime an outside writer refreshes makes a
   tree read YOUNGER, so poisoning this clock — ADR-0387's fault class — holds trees back rather
   than reaping live ones.

   The prefix deliberately covers `storytree-real-chain-*`, the drive real-chain fixtures, which cut
   throwaway repos under the same prefix and have no teardown of their own. They are this repo's
   temp trees by the same argument.

2. **`~/.codex/worktrees/*` stays unmanaged, explicitly.** It is the Codex CLI's own working area,
   created and named by a tool this repo does not drive. Reaping another tool's workspace on our
   threshold would be us guessing about liveness we cannot observe. Codex owns its own hygiene.

3. **`C:\code\storytree-*` sibling checkouts stay unmanaged, explicitly.** They are deliberate
   operator checkouts, not farm. `storytree-runtime` is load-bearing — it is the checkout the
   desktop app serves from, and reaping it breaks the app. An operator's own directory is never ours
   to remove.

This **amends ADR-0387** rather than superseding it: the clock decision stands unchanged, and this
adds the universe half of the same defect, which ADR-0387's body does not cover.

## Consequences

- The 6.6 GB no longer accumulates. The bound is now one build's worth of leak plus the threshold,
  instead of seven weeks and counting.
- **The sweep is rare by construction, because its trigger is the thing that creates the mess.** A
  box that runs no REAL builds accumulates no temp trees and needs no sweep; a box that runs them
  sweeps on every one. That is the property that makes the creator the right owner, and it is also
  the reason a backlog that predates the fix needs one manual drain (done 2026-08-20) rather than
  waiting for the next build to nibble 4 off it.
- **A test suite that cuts real build worktrees now performs real housekeeping in the real temp
  dir.** `build-worktree.test.ts` already cuts real worktrees in `os.tmpdir()` against real git, so
  this is in character rather than a new class of side effect — but it is a genuine widening of what
  those tests touch, and `sweepStale: false` is the escape hatch for a caller that wants none of it.
  In CI the temp dir is fresh, so it is always a no-op there.
- **The reaper's census still under-counts the machine, and now says so.** `worktree drain` counts
  the managed farm only. That is correct under this decision — the other classes have owners — but a
  reader asking "how many worktrees are on this box?" must still ask `git worktree list` and the
  filesystem. The `gatherSnapshots` doc comment names all four classes so the answer is one read
  away.
- **The Codex and sibling-checkout classes are now a recorded decision rather than an oversight.** If
  either becomes a real cost, reopening it means overturning a decision with a stated reason, which
  is the honest bar — not rediscovering a surprise.

## References

- ADR-0387 — the same arc's clock half (amended here, not superseded).
- ADR-0033 — worktree basename IS the session id; why that identity trick does not reach temp trees.
- `packages/orchestrator/src/build-worktree.ts` — `sweepStaleBuildWorktrees`, and the corrected
  `dropWorktree` / `removeDirBestEffort` comments that used to mis-delegate.
- `packages/orchestrator/src/build-worktree-sweep.test.ts` — the red-green lockdown.
- `packages/cli/src/worktree.ts` — `gatherSnapshots`, where the four classes are named.
