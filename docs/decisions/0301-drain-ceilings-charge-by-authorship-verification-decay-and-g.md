---
status: accepted
decided: 2026-08-04
arc: verification-integrity-arc
amends: [252]
---
# ADR-0301: Drain ceilings charge by authorship: verification-decay and graduation-worklist

## Status

accepted (2026-08-04) — directed by the owner in conversation on 2026-08-04, who carried the
constraints verbatim and delegated ONE judgement (recorded in D6 below) to the executing session.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amended by ADR-0311 (2026-08-05):** the attribution logic for both diagnostics remains current.
`check:verification-decay` remains a gate rung with every ceiling unchanged;
`check:graduation-worklist` retires from root/CI gate policy and is now on-demand only.

## Context

ADR-0290 established that a fail-closed drain ceiling must measure what the BRANCH authored, not what a
shared surface holds, and removed that defect from `check:corpus-content`. Two more ceilings have since
been measured exhibiting the same shape. They are the same mechanism applied to two checks, which is
why they land together.

### `check:verification-decay` — measured 2026-08-03, PR #1119

`pnpm gate:bg` failed at `unproven-seam-default: 25 located, ceiling 24. Landing is blocked until THIS
instrument returns to 24 or below`. **None of the 25 located symbols were in that session's diff** —
they span nine packages no single diff covers. The check prints no authorship signal, so proving that
took a manual differential: moving five new files aside and `git stash`-ing five edits to reconstruct a
tree identical to `origin/main`, re-running, and getting the same 25/24. Roughly 15 minutes, on top of
a gate run that had already spent its ~10 expensive minutes reaching the red.

The sweep's population is everything every session has ever landed; the ceiling is charged to whoever
runs the gate next. Those are not the same party. And the check's own message offered exactly two
exits — repair a located signal, or raise the ceiling — of which ADR-0252 D3 and ADR-0269 forbid the
second. A session that cannot tell whose breach it is, and cannot cheaply repair a symbol in a package
it does not know, was being aimed at the one remedy it is not allowed to take.

### `check:graduation-worklist` — measured in PR #1124

A commissioned board-drain session drained the queue properly (3 arc-state trackers parked, 1 genuine
gap graduated) and verified `OK — no live agent-memory candidates`, 0 live. **Within ~15 minutes it was
RED again at 7 live**, entirely from sibling sessions writing memory files between 20:56 and 21:11.
None belonged to the draining session. The drain worked, was verified, and evaporated — through no
fault of the drainer and with nothing it could have done differently.

Its own source header already named two limitations: (1) no own-homework exclusion, because a
`MemoryFile` carried no provenance to key one on, and (2) the input is machine-shared, not
session-local (`~/.claude/projects/<slug>/memory`, ADR-0202, resolved through the MAIN checkout), and
the drain that clears it has no claim protecting it.

### The constraint

**Raising either ceiling was not available**, for the reason ADR-0290 recorded: ADR-0269 is accepted and
load-bearing — a ceiling rises only when the measured population enlarges, never to absorb growth. The
populations had not enlarged. They were **mis-apertured**.

## Decision

**Both ceilings measure what THIS BRANCH is answerable for. Every ceiling VALUE is unchanged; the
aperture changes.** This is the ADR-0269 4(f) decomposition for both.

**D1 — `check:verification-decay` attributes each located signal, and charges only what this branch
could have caused.** A finding is AUTHORED when this branch touched any file it rests on; INHERITED
when every such file is identical to `git merge-base origin/main HEAD`. Two outcomes, not ADR-0290's
three: there, live is a shared STORE and BEHIND MAIN separates "a sibling wrote live" from "main
already exported it"; here both sides are source in one git tree, so those collapse into one class with
one remedy — the standing drain.

**D2 — a breach that is entirely INHERITED is a loud WARN, never a RED and never a silence.** When an
instrument is over its ceiling and nothing of that breach is this branch's, the check says exactly
that: over ceiling on main, not yours, your landing is not blocked, and the standing obligation is a
drain — explicitly not a raised ceiling, and explicitly not a differential to prove innocence the check
has already proved. That sentence is the one whose absence cost the 15 minutes. **This is the single
place where output is less severe than before, and it is deliberately WARN rather than green**: a
silent pass over a breached main would be strictly worse than the noisy red it replaces, because it
would retire the standing drain obligation along with the tax.

**D3 — a finding declares its BASIS, and the parked entry's premise is corrected.** That entry chose
file granularity over per-symbol history on cost and asserted that file granularity "cannot
under-charge — it can only over-charge". That holds for a per-file instrument and is FALSE for a
cross-referencing one, which is four of the five: `unproven-seam-default` keys on a symbol's absence
from the repo-wide TEST corpus, so deleting a test creates a signal in a source file the branch never
opened; `mirror-pair-drift` is created by whichever surface dispatched the route second, while it
points at the desktop half; `warn-list-hygiene` reads a check's entry AND its sibling judge, where the
exit path actually lives; `contract-binding-drift` goes dead when its TARGET is deleted. Under a
`where`-only rule every one of those reads INHERITED and goes uncharged — the wrongly-EXCUSED
direction, which ADR-0290's asymmetry argument rules out. So attribution reads every file a finding
rests on, and two shell-computed escape hatches close the rest, both of which only ever move a finding
TOWARDS being charged: a per-instrument cross-input guard, and a per-finding proof. The seam-default
case is answered EXACTLY rather than guarded — the same finder is re-run against the merge-base symbol
table — because the blunt guard would fire on any session touching any test file, which is nearly all
of them, and a fix that is technically fail-closed and practically absent is not a fix.

**D4 — `check:graduation-worklist` gains memory-file provenance and an own-homework exclusion, in
`friction-drain.ts`'s direction, not `check:corpus-content`'s.** Memory frontmatter carries an optional
`metadata.branch`; the ceiling charges the live backlog MINUS this session's own. The direction is the
friction ceiling's because the REMEDY is: draining this queue is a librarian pass over the whole queue,
which any session may legitimately run and which commits nothing under anyone's name — unlike an export
of a sibling's live body. So a sibling's memory is charged, and only your own is excluded.
**UNATTRIBUTED IS CHARGED** — a positive branch match is the only exclusion, mirroring
`friction-drain.ts`'s `isOwnItem` exactly, so the backlog cannot drain by going anonymous.

**D5 — the authorship split is PRINTED on every path with a live queue, charged or not.** This is the
half that removes measured cost. An exclusion cannot answer "are these mine?", because by construction
it only suppresses the candidates that were never the problem. A printed line can. The same holds on
the decay side, where NOT YOURS signals are listed in full rather than summarised to a count — a count
leaves the reader to re-derive exactly what the differential re-derived.

**D6 — the delegated judgement: provenance ships ALONE, as an acknowledged partial, and the residual is
named rather than glossed.** On the #1124 numbers an own-homework exclusion **would have changed
NOTHING**: all 7 candidates belonged to sibling sessions, which such an exclusion does not suppress by
construction. Limitation (2) — the machine-shared queue with an unprotected drain — is the load-bearing
one, and it is NOT fixed here. It is shipped as a partial because every candidate fix to (2) needs a
mechanism this unit does not own and this check's reachability contract forbids: a claim over a
machine-shared queue, or an in-flight-session liveness signal, both of which need the DB that
`check:graduation-worklist` deliberately does not require; or an ADR-0202 amendment making the queue
session-local. Provenance is a stated prerequisite for all three — you cannot ask "is that session
still in flight" without first knowing whose it is. The residual is parked on
`verification-integrity-arc` as its own entry, printed in the check's own output when siblings are
charged, and recorded in `graduation-drain.ts`'s header as OPEN. **Nobody should read the exclusion as
preventing the observed red.**

**D7 — every ceiling VALUE is unchanged, and this is not a raise.** N stays 4 for the graduation queue;
all five decay ceilings stay where they were. ADR-0252 D3 says a ceiling's remedy is a drain and never
a raise, and ADR-0269 fences when one may rise at all — neither is touched. **This is recorded
explicitly because the change can be mistaken for gaming a ceiling, and the tell that separates them is
that WHAT is counted changed, not merely HOW MANY are tolerated.** The located counts, and the OK/WARN
levels computed from them, are identical to before; what moved is who a resulting breach belongs to.

**D8 — attribution fails CLOSED, per axis.** If git cannot name a branch or a merge base — a detached
HEAD, an unfetched `origin/main`, a non-repo checkout — every signal is charged exactly as before ADR-0301,
and the reason is PRINTED so a charge is never mistaken for a verdict. An attributor that throws degrades
the same way and never takes the sweep down. A finding the classifier never saw is charged, not excused.
`origin/main` is read locally and never fetched (CLAUDE.md: no reflexive fetch); a stale ref can only
widen the touched set, which over-charges — the safe direction. The graduation side inherits the same
posture: no branch means nothing is excluded. **And the SUBSTRATE guard is untouched** — an absent or
unreadable park ledger still SUPPRESSES a computed breach rather than redding, because an unusable
ledger reclassifies every memory as `new` (measured: 4 live becomes 104), which measures the substrate
rather than the queue.

## Consequences

**Good.**
- The measured defect remains closed for `check:verification-decay`: a session that authored nothing
  is no longer blocked by a breach that was on `main` before it started. The graduation diagnostic
  retains the same attribution when invoked, but ADR-0311 removes its merge-blocking role entirely.
- A session that DOES introduce a signal is caught exactly as precisely as before — and now named as
  YOURS, so the report distinguishes the two cases it previously conflated.
- Attribution is strictly more honest than the entry specified: four instruments whose cross-references
  would have silently under-charged are closed, one of them exactly rather than bluntly.
- `check:graduation-worklist` gains the property ADR-0168 D4 gave its sibling — a retro that writes
  memories can no longer trip its own ceiling — and prints the authorship split that answers the
  question the #1124 drain session had to answer by hand.

**Bad / accepted.**
- **D6's residual.** The graduation queue is still machine-shared and its drain still unprotected; a
  verified drain can still be undone by a sibling before the session merges. Provenance does not fix
  this and is not claimed to.
- Memory provenance rests on a stamp that only exists going FORWARD, and unlike ADR-0290 D2's actor
  stamp there is no write path to set it: agents write memory files with a file tool, so no CLI verb
  and no gate can require it. On landing day every memory on the machine is unattributed, and therefore
  charged — the behaviour is byte-identical to before until agents begin stamping. Stated rather than
  hidden: **on the measured numbers, D4 changes nothing today.**
- A branch that touched a file for an unrelated reason inherits any pre-existing signal in it. That is
  over-charging, chosen deliberately over per-symbol history walks on cost, and it is the fail-closed
  direction.
- One `merge-base`, one `diff`, one `ls-files`, one `ls-tree` and one `show` per touched test file, per
  run. Bounded and local; both checks remain DB-free, but only verification-decay remains in the gate.
- **The sequencing the parked entry asked for was already lost.** It said to land this BEFORE draining
  the 25th signal, so the change would have a real pre-existing breach to demonstrate against. The
  drain landed first (PR #1131, 2026-08-04), so both checks are green today and the proof rests on
  synthetic fixtures — every one of which was mutation-verified (7 mutations, each confirmed to red the
  specific test claiming to cover it) precisely because a fixture-only proof is the shape that can pass
  while proving nothing.

## References

- [ADR-0290](0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md) — the precedent this
  applies to two more checks: attribution from exact signals, the rest reported and never charged, and
  the fail-closed-per-axis posture D8 inherits.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D3 — the drain-ceiling
  shape; amended here in APERTURE, not in value.
- [ADR-0269](0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md) — a ceiling rises only
  on an enlarged population; 4(f) is the decomposition requirement D7 discharges.
- [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) D4 — the friction drain
  ceiling whose `isOwnItem` direction D4 mirrors, and whose evidence for a ceiling was THIS queue.
- [ADR-0202](0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md) — the park lease and
  the machine-shared memory dir D6's residual turns on.
- [ADR-0278](0278-a-fifth-verification-decay-instrument-an-injected-seam-whose.md) — the instrument whose
  measured 25/24 breach motivated this.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born `accepted`.
- `packages/cli/src/decay-attribution.ts` · `check-verification-decay.ts` · `verification-decay.ts` ·
  `graduation-drain.ts` · `check-graduation-worklist.ts` · `graduate.ts` ·
  `packages/library/src/graduation/graduation.ts`.
- `process:verification-decay-detection` — the process artifact whose named failure mode (softening a
  check under its ceiling) D2 and D7 are written against.
