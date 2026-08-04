---
status: accepted
amends: [271, 275]
decided: 2026-08-04
arc: session-decoupling-arc
---
# ADR-0303: An escalation is a landing event: a blocked session lands its state and releases its claims

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0271 and ADR-0275 settled what happens **after** a unit merges: residue, release claims, debrief,
then inert or a fresh worktree. That was measured working — 13/13 merged sessions ran the closing leg
the night ADR-0271 landed, owner asks fell 20 → 0, watch-polling fell 21.1 h → 41 min. ADR-0275 D2
lists an owner LOOK, decision, or attestation among its hard ends, and routes owner-gated work back
in through a chip.

Nothing covers the other case: a session that needs the owner **mid-unit**, before its work is green.
There is no merge to hang a closing leg off, so the session waits — sitting on an unmerged branch,
holding a live claim on its node, until the owner returns. The owner named this directly:
*"i think we drifted away from this since sessions keep going inert… as soon as a session needs my
input they merge to main whatever changes they have already made / or land their plans and state in
an arc and then release any of their claims."*

The owner believed this had already been asked for. It had not, and the distinction changes what is
being written: **this is a gap the decided rules never reached, not drift from a rule.** ADR-0271/0275
describe a session whose unit *finished*. A session blocked mid-unit was simply never in their scope.

The cost is concrete. A dormant session holding a capability claim blocks the next session that wants
that capability — the one form of claim contention the ledger cannot resolve, because the holder is
not working and will not release. And the work itself is invisible: it lives in an unmerged worktree
that no arc, no PR and no ledger entry describes, so if the session is lost the work is lost with it.
That is the same shape as the stranded-context incident already recorded on
`factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, where a dead session's entire change
set — including a fully-written ADR — sat untracked in a worktree with no commit, no branch upstream
and no PR, and had to be recovered by hand a day later.

## Decision

**D1 — hitting an owner gate is a landing event, not a pause.** When a session needs an owner LOOK,
decision, or attestation and cannot proceed, it lands: it records its state on the owning arc and
**releases its claims**. It does not wait, and it does not hold a claim while waiting.

**D2 — merge what can merge; the arc carries the rest.** Where the work in hand can already land
green it goes through the normal ceremony first (gate → non-draft PR → CI merges). Where it cannot,
the arc entry **is** the residue: what was being attempted, what is done, what is not, what the owner
was asked, and what the next session needs in order to resume. Nothing here weakens the gate — red
work never reaches `main`, and "merge whatever you have" is never literal.

**D3 — resumption re-pulls, and re-syncing is the resuming session's own responsibility.** When the
owner answers, work resumes in a **fresh worktree cut from a freshly-fetched `origin/main`**. The
resuming session owns bringing itself current; the blocked session is not expected to have preserved
a mergeable tree, and no branch is held open across the wait.

**D4 — no session waits on the owner while holding a claim.** This is the invariant the other three
serve. A claim means a session is *writing*; a session waiting on a human is not writing.

## Consequences

**Good.** Claims stop being held by dormant sessions, which removes the only claim contention the
ledger cannot resolve on its own. Blocked work becomes visible — it is on an arc, queryable by any
session, rather than in a worktree only the dead session knew about. The owner's return no longer
requires the original session to still exist, which is what makes burst-*answering* as cheap as
burst-approving. And it composes with `session-decoupling-arc`'s thesis: a session that waits is a
session accumulating staleness for free.

**Bad, and accepted.** State landed on an arc is prose, so resumption is only as good as the write-up
— a thin entry loses context the session had. The unmerged tree is abandoned rather than preserved,
so genuinely un-landed work is re-done; that is the deliberate trade against holding a branch and a
claim open indefinitely. Sessions blocked very early will land near-empty arc entries, which is noise,
though cheaper than the alternative.

**Unchanged.** ADR-0275 D2's four hard ends stand; this ADR does not re-open whether a session
continues past merge. It says only what a session does when the gate it hits is the *owner*, before
its unit is finished. Owner-gated work still re-enters through a chip or a fresh session, never by a
session sitting and waiting.

## References

- `session-decoupling-arc` — the owning arc.
- ADR-0271 — sessions end at merge; the closing leg this extends to a case it did not cover.
- ADR-0275 — the continue-or-inert fork and its hard ends, including owner-gated work.
- ADR-0270 — capability-grain claims; D4's invariant is what keeps them releasable.
- ADR-0183 D1 — the arc increment log as durable residue; D2 writes to that surface.
- ADR-0142 — a branch dies on merge, which is why D3 resumes from a fresh worktree rather than a held one.
