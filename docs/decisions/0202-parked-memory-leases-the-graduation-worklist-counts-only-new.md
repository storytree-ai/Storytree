---
status: accepted
decided: 2026-07-16
arc: graduation-park-lease-arc
amends: [95]
---
# ADR-0202: Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates

## Status

accepted (2026-07-16) — decided/directed by the owner in conversation on 2026-07-16. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The ADR-0095 memory→Library graduation loop gave the gate a best-effort tail check
(`check:graduation-worklist`) that WARNs when agent-memory candidates await a librarian graduation
pass. The mechanical engine treats **every** agent-memory file as a novel candidate, and a librarian
pass has no way to record "reviewed — belongs in memory, won't graduate". The measured consequence
(the 2026-07-16 pre-merge librarian pass for PR #736): **70 candidates triaged, 0 graduated, 0
deleted** — every one a deliberate non-graduate (event-specific arc-state pointers, machine-specific
ops traps, un-graduated owner preferences). So every session's gate prints the same ~70-candidate
WARN, every librarian pass re-triages the same pile to the same verdicts, and a genuinely new
candidate is invisible inside the standing noise. The WARN has stopped carrying signal.

Two rejected corrections frame the decision:

- **Purging the non-graduates** — wrong, because "won't graduate to the Library" ≠ "not useful":
  the closed-arc pointers are the do-NOT-re-spawn guard against duplicate paid builds, the
  machine-specific traps (pool-close hang, gate OOM) save real re-discovery cost on this box, and
  ADR-0095's own rule is *deletion follows graduation* — knowledge is never simply destroyed.
- **Accepting the standing WARN** — wrong, because a permanently-red advisory numbs the reader and
  buries the one candidate that matters (the owner: not "something that's good for other sessions").

## Decision

A librarian verdict can **park** a reviewed memory, and the park is a **lease, not a tombstone**:

1. **The park marker.** A librarian pass records, per parked memory: the verdict
   (`won't-graduate`), the **reason**, a **content hash** of the memory at review time, the
   **review date**, and the **lease length**. A parked memory is excluded from the
   `check:graduation-worklist` count while the lease holds AND the content hash still matches.
2. **Hash invalidation.** Any edit to a parked memory breaks the hash and the item re-enters the
   worklist immediately — an evolved memory gets fresh eyes without anyone remembering to ask.
3. **The lease expires — default 60 days.** On expiry the item returns to the librarian with the
   question **inverted**: not "should this graduate?" but "**is this still alive?**", with exactly
   three honest outcomes: **re-park** (still earning its keep), **delete** (its risk has passed —
   e.g. a closed-arc pointer whose follow-up landed, a trap fixed by a landed ADR), or
   **graduate-then-delete** (it proved durable after all). A single default lease is the starting
   point; the recorded reason guides the re-review (flavour-specific leases are a refinement the
   re-review data can earn later, not part of this decision).
4. **The counter counts only live candidates.** `check:graduation-worklist` WARNs on: candidates
   with no park record (new), parked candidates whose content hash no longer matches (changed), and
   parked candidates past their lease (expired). The WARN is therefore normally **zero** and
   meaningful when it isn't. It stays **local-only** (machine-local ledger; CI SKIPs it), exactly as
   ADR-0095 D7 positioned it. *(This clause originally read "advisory/local-only (never a block)";
   see the correction below — the counting rule decided here is untouched.)*

This **amends ADR-0095**: D7's librarian pass gains the park ceremony and the inverted expiry
re-review; the deletion rule is refined from "deletion follows graduation" to "deletion follows
graduation **or a lease re-review that finds the memory dead**" — deletion still never happens
without an explicit reviewed verdict.

## Consequences

- The graduation WARN regains signal: quiet when the pile is triaged, loud only on new material.
  Sessions stop paying repeat triage on the same ~70; the librarian's bounded pass goes to genuinely
  new candidates.
- Dead memories are **bounded**: worst case a memory outlives its usefulness by one lease period,
  then a reviewed verdict deletes it — the owner's "redundant or dead memories don't linger" bar.
- The park ledger is machine-local state alongside the memory it describes (agent memory is
  per-machine; the ledger's exact shape and location are implementation surface — the plan's
  domain, ADR-0183 D4, not this decision's).
- First increment owes a **backfill triage**: the standing ~70 candidates get parked with reasons
  (or deleted/graduated where that is the honest verdict) so the WARN starts quiet rather than
  waiting a lease period to converge.
- The `graduation-synthesist`'s adjudication seat (ADR-0168 D5) is unchanged — parking is a
  librarian curation verdict about *memory residence*, not a friction adjudication.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
D4's "never a block" was overtaken and is removed; the decision itself is untouched.**
`check:graduation-worklist` is now **fail-closed at a drain ceiling** — live-candidate count > **N=4**
or oldest lease-expired candidate > **M=21d**, two independent axes never summed, the
[ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) D4 `check:friction-drain`
shape (`packages/cli/src/graduation-drain.ts`). **Nothing decided here is re-decided.** What this ADR
decided is the *park ceremony* and the *counting rule* — verdict, reason, content hash, review date,
lease; count only new / changed / lease-expired — and every part of that stands unchanged; the ceiling
is applied to the number this ADR taught the counter to produce. "Never a block" was a restatement of
ADR-0095 D7's positioning rather than a fork this ADR took, and the authority to bound the queue came
later and from elsewhere: [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md)
D1 charters the `warn-list-hygiene` instrument precisely to locate advisory worklists that no exit code
bounds, and D3 supplies the ceiling as their remedy. The dependency runs the *other* way from a
reversal: a ceiling on this queue would have been permanently red before the park lease, and is only
honest **because** this ADR made the normal count zero. Recorded rather than left, because a reader of
D4 alone would meet a red `check:graduation-worklist` and conclude the ceiling violates this ADR — the
exact stale-prose harm ADR-0139 exists to prevent. Fail-open on the substrate is preserved: an absent
or unreadable park ledger reports the would-be breach and exits 0, so a missing machine-local file can
never block a landing.

## References

- ADR-0095 — the memory→Library graduation loop this amends (D7 librarian pass, D8 rejection norm).
- ADR-0168 — the friction/adjudication machinery the park verdict deliberately does NOT touch.
- ADR-0110 — design-time ratification (this ADR born accepted, owner-directed 2026-07-16).
- `storytree arc show graduation-park-lease-arc --pg` — the delivery arc.
- Evidence run: the 2026-07-16 librarian pass (70 triaged / 0 graduated / 0 deleted) in the PR #736
  landing session.
