---
status: accepted
decided: 2026-08-11
arc: arcs-hold-increments-arc
amends: [335]
---
# ADR-0347: arc close refuses over open increments: draining the work is the closing act

## Status

accepted (2026-08-11) — decided/directed by the owner in conversation on 2026-08-11. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. It **amends ADR-0335**, whose
D3 it reverses; the rest of ADR-0335 stands unchanged and stays accepted.

## Context

ADR-0335 made an arc's `lifecycle` mechanical: every increment write recomputes it from the
increment log, so an arc auto-closes when its last open increment closes (D2's rule read forward) and
auto-reopens the moment forward-looking work is parked on it (D2 read backward). D3 then carved out
`arc close`: the explicit verb "still force-closes an arc even with open increments remaining — an
owner call the mechanical rule never makes on its own."

**That carve-out and D2 are in latent contradiction, and the contradiction has a direction.** A
force-close asserts "this initiative is over"; D2's rule asserts "an arc holding forward-looking work
is open". They disagree about exactly the arcs where it matters, and the disagreement is invisible to
every write-time trigger, because a trigger only ever looks at one arc at the moment somebody writes
an increment on it. Nobody writes increments on an arc they have just declared finished.

**The sweep is what made it visible, and the number was not small.** `storytree arc reconcile`
(ADR-0335's missing reconciler, landed 2026-08-11 in PR #1276) found TEN arcs stored `closed` while
holding 42 forward-looking increments between them. The reconciler could not simply repair that —
reopening ten arcs the owner had deliberately closed is not drift correction, it is a second opinion
— so the reopen half was withheld and the fork was authored as an open question on this arc.

**Two of the 42 were the real thing, and their shape is the case for refusing.**
`offer-lifecycle-terminal-verb` on `context-decision-tree-arc` and
`check-agents-names-the-branch-that-did-not-edit` on `diagnosis-honesty-arc` were both parked
2026-08-08 and both had their arcs closed 2026-08-09 by the same actor — about two arcs per
fortnight at the observed rate. Both were still wanted when someone finally read them. Both had been
invisible for three days, and invisible in the specific way that matters: they sat on arcs that
appeared on no worklist, so nobody working normally would ever have encountered them. Only a sweep
over every arc at once surfaced them. **This is not a reporting gap that a better view fixes.** The
work was recorded correctly, on the right arc, in the right tier; the closing act is what removed the
surface it was recorded on.

**The other 40 are why this decision could not have been made a week ago, and that is worth stating
rather than eliding.** They were pre-fold PLAN rows — disposable per-increment scratch under
ADR-0183 D2, stranded `open` when ADR-0305 D2 dropped the `consumed`/`superseded` statuses the plan
lifecycle used to terminate on. A refusal shipped then would have fired on 40 rows that did not
matter before it ever fired on the 2 that did, which is precisely how a signal teaches its operators
to reach for the override. Those 40 are now closed and the store is all but reconciled — 60 of 61
arcs agree with their own increment log, the one holdout being a separately-adjudicated case — so the
population this refusal fires on is clean. **The measurement had to precede the
refusal**, and the marker that partitioned the 42 with zero judgement calls was `anchor` presence —
an increment is anchored exactly when it was planned (ADR-0334 D1, affirming ADR-0333 D1) — not a
name pattern.

## Decision

**D1. `storytree arc close` REFUSES when the arc still holds forward-looking increments**, naming
each one — id, status, and the date it was parked — so the operator can close or re-home them
first. This reverses ADR-0335 D3. The refusal is total: neither the terminal increment nor the
lifecycle flip is written, so a refused close leaves the store exactly as it found it.

**D2. There is NO override — no `--force`, no `--abandon-open`.** Abandoning an arc together with
its open work stays entirely possible; it is spelled by closing each increment with its own reason
(`arc increment close <id> --note "<why>" --pg`), which the refusal prints ready to paste. This is
not a hardship path grudgingly left open — **it produces a strictly better record than a flag
would.** A blanket `--force` reason covers N items with one sentence; a drained increment says why
*it* was abandoned, on the row a later reader will actually open. Both observed instances were two
commands. The case for an override was that abandonment should be a recorded act rather than
something that happens by not noticing; the drain path already satisfies that, so the case collapses
and what is left is an easy override that gets reached for.

**D3. Only `arc close` refuses. The mechanical recompute must NOT.** `recomputeArcLifecycle` has no
operator to talk to and its whole job is to follow the log; a refusal there would break the
auto-reopen that ADR-0335 D2 depends on and that this decision is aligning itself with.

**D4. The refusal reuses `isForwardLooking` (`@storytree/drive`), never a second predicate.**
`deriveArcLifecycle` / `isForwardLooking` are the one place the forward-looking rule lives, shared by
the write-time trigger and `arc reconcile` (PR #1276). A refusal computing "still open" its own way
would be a third answer to the same question, and the divergence would show up as a verb that
refuses to close an arc the reconciler thinks is already closed. Reuse also inherits the predicate's
FAIL-CLOSED property for free: `isForwardLooking` ranks a status it does not recognise with the
open half, so a row this code cannot read refuses the close rather than being closed over. A bespoke
`status === "proposal" || …` check would have quietly done the opposite.

**D5. An anchored row is ANNOTATED, not filtered.** A forward-looking increment carrying an `anchor`
still counts toward the refusal, and is marked `[planned]` in the listing. Filtering anchored rows
out would be a second predicate by the back door (D4) and would silently narrow the refusal on
exactly the population whose disposability is a historical accident rather than a rule. Marking them
lets an operator recognise a scratch row on sight and close it in one command.

## Consequences

**`arc close`'s ordinary path narrows sharply, and this is the point rather than a side effect.** An
arc whose work drains no longer needs the verb at all: closing the last open increment auto-closes
the arc through ADR-0335 D2's existing rule, and prints that it did. What is left for `arc close` is
the set the mechanical rule cannot reach — an arc reopened by `arc reopen` (ADR-0337) with nothing
parked, an arc in ADR-0335 D1's birth window with no increments yet, an arc whose stored lifecycle
has drifted. Both verbs now exist for the cases the derived rule cannot express — but they are **not
symmetric about overriding it**, and saying so is worth more than a tidy parallel: `arc reopen` still
forces its direction (ADR-0337 D4), because an arc reopened without parked work is a judgement the
log genuinely cannot hold. `arc close` no longer forces, because an arc closed over parked work is a
judgement the log holds and contradicts.

**A consequence of that narrowing, stated plainly rather than banked:** an operator who drains an
arc's last increment and also wants a terminal statement of the end state on the log must append it
afterwards (`arc increment add <arc> --outcome "…" --pg`), because the auto-close beat them to the
flip and `arc close` refuses on an already-closed arc. The refusal message says so. This is not new
behaviour — every naturally-drained arc has closed this way since ADR-0335 — but the refusal makes it
the common path instead of the incidental one, so it is now worth knowing.

**Closing an arc becomes a two-part act with a cost proportional to what is being abandoned.** Ten
open increments means ten deliberate closures. That is the intended friction and the intended signal:
if drawing down the work is tedious, the arc was not finished. What it must not become is a reason to
leave arcs open — an arc that genuinely drained still closes itself for free, with no ceremony at all.

**This repairs nothing that already exists — it stops the population growing.** The verb changes
going forward; no arc is reopened by it. That population is nearly drained already: measured at
landing, 60 of 61 arcs agree with their own increment log, and the single remaining
closed-arc-with-open-work (`parallel-session-dispatch-arc`, 2 open) is a known case whose increments
were adjudicated on their own terms. `arc reconcile --only reopen` stays the instrument if it ever
matters again, and stays a separate call — reopening an arc somebody closed deliberately is a second
opinion, not drift correction.

**The refusal is unguarded by any check rung, and that is the cheap answer for now.** Whether
`lifecycle === derived(increments)` earns a `libraryHealth` WARN leg is a
`process:justify-a-gate-rung` question, and the worktree-reaper precedent (a rung refused 2026-08-08
on 0 fails in 47 runs) says to collect evidence of recurrence first. The verb refusing at the moment
of the mistake is a better instrument than a rung firing later anyway.

**If anchored forward-looking rows reappear in volume, revisit D5.** The 40 were stranded by a
lifecycle transition that has since landed, so the expectation is that they do not come back. If they
do, the honest response is to fix whatever is stranding them — not to teach the refusal to look away.

## References

- [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md) — the amended
  decision: lifecycle is mechanical (D1/D2 stand); **D3's force-close is what this reverses**.
- [ADR-0337](0337-an-agent-may-reopen-a-closed-arc-arc-reopen-records-why-then.md) — `arc reopen`,
  the mirror verb, and the shared principle that a state change is allowed when prose justifies it.
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — the increment
  tier: `proposal → ready → active → closed`, and D2's removal of `consumed`/`superseded` that
  stranded the 40 plan rows.
- [ADR-0334](0334-plan-lane-width-is-planned-for-not-discovered-the-fan-out-ar.md) D1 — affirms the
  discriminator D5's annotation uses: "an increment is anchored when it is planned" (originally
  ADR-0333 D1, superseded but browsable; the field itself is `anchor` in
  `packages/library/src/knowledge.ts`, optional at birth because a parked intention has nothing to
  anchor to yet).
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) D2 — `arc close`
  writes the terminal increment AND the flip; `--outcome` required, because state projects prose.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D2/D3 — the arc
  overlay, the child-side containment edge, and plans as disposable scratch.
- `packages/cli/src/arc.ts` (`arcClose`, `recomputeArcLifecycle`) ·
  `packages/drive/src/arc-rollup.ts` (`isForwardLooking`, `deriveArcLifecycle` — the one predicate).
- The open question this discharges: `oq-ten-arcs-are-closed-but-still-hold-open-work-which-rule-w`
  on `arcs-hold-increments-arc` (retired on the owner's answer).
