---
status: accepted
decided: 2026-08-10
---

# ADR-0339: Warn at ADR allocation when other sessions hold numbers this checkout lacks

## Status

accepted (2026-08-10) — decided/directed by the owner in conversation on 2026-08-10. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

**The failure, 2026-08-09.** Two owner-directed ADRs were decided the same day, in parallel sessions,
neither aware of the other, and they partially CONTRADICTED each other:

- **ADR-0335** (PR #1254, merged 14:05Z) made arc `lifecycle` DERIVED from increment state, and its
  D3 stated there should be NO bare reopen verb.
- **ADR-0337** (PR #1255) added exactly that bare verb, `storytree arc reopen`.

Nothing in the ceremony caught it. The ADR-0337 session ran the prescribed pre-PR
`git fetch origin && git merge origin/main` and got **"Already up to date"** — truthfully, because
#1254 had not merged yet. `pnpm gate` is branch-local by construction (ADR-0304 narrows it further),
so it cannot see another branch's decision. CI would have surfaced the overlap only as a **merge
conflict**, and by then both designs were settled — at which point the natural move is to resolve the
hunks, and resolving hunks is how a session silently overrides an accepted, owner-directed decision.

The collision was found **by luck**: the session happened to notice that a sibling had edited an
unrelated line of its own agent-memory index, and that line mentioned ADR-0335. It was then handled
correctly — the PR was held as draft, the overlap was put back to the owner *including the option of
closing the PR as redundant*, the owner kept both, and the result was recorded as `amends: [239, 335]`
with the contradicted clause corrected in place per ADR-0139. Correct, but it cost a full rework
cycle, and the safe outcome depended on an accident.

**The signal already existed and was being thrown away.** `storytree adr new --pg` reserves the next
number ATOMICALLY from the live store (ADR-0050, `packages/library/src/store/adr-store.ts`): it
computes `GREATEST(localMax, max-ever-handed-out) + 1`. So at the moment it handed that session
**0337**, it knew for a fact that **0335** and **0336** had been handed out — while the session had
neither file on disk. The allocator returned the number and discarded everything else it knew. That
gap is the whole warning.

The generalisable lesson from the incident is recorded separately in agent memory
(`concurrent-adr-can-contradict-yours-same-day.md`): when two decisions look opposed, check whether
one already tolerates the exact property the other needs.

## Decision

### D1 — The allocation envelope names the numbers this checkout does not have

`storytree adr new` and `storytree adr next` compute
`parallelAllocations(localMax, reserved)` — every number strictly between the highest ADR file in
`docs/decisions/` and the number just reserved — and, when that set is non-empty, print it with what
it means and what to do:

```
⚠️  ADR-0335, 0336 were allocated by other sessions and are NOT in this checkout.
    A decision written in parallel can CONTRADICT yours. If any of them touches your area,
    READ it BEFORE you write your Decision — this same overlap surfaces later as a CI merge
    conflict, where resolving the hunks silently overrides an accepted decision.
```

The set is **exact, not heuristic**. Because the allocator reserves
`GREATEST(localMax, max-ever-handed-out) + 1`, a number more than one above this checkout's max is
*proof* that the store's own max was ahead of us — nothing else can produce that gap. Every number
reported was genuinely allocated elsewhere.

It costs **no network call and no extra query**: both inputs are already in hand at the moment of
allocation. Fetching is offered as the reader's next step, never performed.

### D2 — It is a heads-up, and never a gate

The envelope stays `ok: true`, the scaffold is still written, and nothing reddens. No `check:*` rung
is proposed, and none should be: `process:justify-a-gate-rung` requires evidence a rung would have
caught something, and the worktree-reaper rung was refused on 2026-08-08 for exactly that lack (0
fails in 47 runs). This warning also cannot be made fail-closed honestly — a reported number may be a
**burned** allocation (an abandoned branch's number is never reused, by design in `adr-store.ts`), so
the only claim it can make is the one it makes: *allocated elsewhere, not in this checkout*. That
claim is true for a burned number too; the reader decides whether it matters.

Nor is it new prompt or agent-artifact text. It is guidance in the tool's own output at the point of
use — the ADR-0023 pull model, the same shape **ADR-0239 D4** chose for its arc-closure hint, whose
stated virtue is **zero context cost for every session that is not doing this**. A session whose
checkout is current sees nothing at all.

### D3 — The offered next step looks across ALL refs, not `origin/main`

The contradicting ADR is typically **not on `origin/main` yet** — that is precisely why the ordinary
pre-PR merge reported "Already up to date" and missed it. So the `next:` block is

```
git fetch origin
git log --all --oneline -- "docs/decisions/0335-*"   then   git show <sha>:<path>
```

`git fetch origin` populates `refs/remotes/origin/*` under the default refspec, so `--all` reaches
the sibling session's unmerged branch. Pointing at `origin/main` would have found nothing on the day
this happened.

### D4 — `adr list` does NOT get the note

Considered and declined, on measurement. `adr list` is the session-start calibration surface and is
documented read-only and **offline** — it touches no database, which is what makes it free to run.
The note it could produce without a store connection is "which numbers have no file here", and on the
live corpus that is **6 for 6 false positives**: 0047, 0065, 0147, 0268, 0281 and 0327 are all
missing, and `git log --all --diff-filter=A` shows none of them ever existed on any branch — every
one is a burned allocation. A permanent, never-actionable warning on the surface every session reads
first is worse than no warning, because it trains the reader to skip the line that will one day
matter. Making `adr list` dial the store instead would tax every calibration read with a round trip
to remove a signal that already fires where it is actionable.

## Consequences

**What this catches.** The 2026-08-09 shape exactly: a sibling allocated before you, so its number is
below yours and its file is absent from your checkout. It fires at the one moment the fix is cheap —
before the prose is written — and it also catches the plainer case of a checkout that has simply gone
stale, where the same `git fetch` is the same right answer.

**What it does not catch, knowingly.** A sibling that allocates *after* you. Your envelope is printed
once, at reservation, and cannot know about a number handed out an hour later. Closing that would
mean a second store read at some later moment — a re-check verb, or a store-aware `adr list` — and
neither is built here: the one measured incident had the sibling allocate first, and D2's own standard
forbids building on absent evidence. If instances of the after-you shape accumulate, the remedy is a
re-check at the pre-PR moment, not a gate.

**Burned numbers read as live ones.** By D2's reasoning this is accepted rather than fixed. The cost
is one `git log --all` that finds nothing, and the message does not assert the ADR exists — only that
the number was allocated and its file is not here.

**No change to allocation.** ADR-0050's atomic reservation is untouched, and is what makes the
warning possible at all. Nothing here adds cross-session locking or claims over ADR topics: the
problem is AWARENESS, not exclusion, and ADR-0270 D2 already settles that a claim conflict is
resolved by the session rather than escalated.

## References

- [ADR-0050](0050-adr-number-allocation.md) — the atomic allocator this reads
  the signal from; unchanged.
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) D4 — the precedent:
  a reminder in the tool's output rather than in any agent prompt, at zero context cost to everyone
  else.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why a silently
  overridden accepted decision is the expensive failure: every accepted ADR must be true in full.
- [ADR-0304](0304-the-gate-measures-what-a-change-affects-and-the-queue-does-t.md) — the branch-local gate
  that structurally cannot see a sibling's decision.
- [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) D2 — a claim conflict is the session's to
  resolve; this ADR adds awareness, not exclusion.
- `packages/cli/src/adr.ts` (`parallelAllocations` / `parallelAllocationNote`) and its suite
  `packages/cli/src/adr.test.ts`; the owning capability is `stories/ci-cd/adr-health-gate.md`.
