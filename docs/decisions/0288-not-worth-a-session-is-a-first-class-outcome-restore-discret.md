---
status: accepted
load_bearing: true
amends: [271, 275]
decided: 2026-08-02
arc: factory-self-load-tune-the-guidance-loop-back-to-evidence-arc
---
# ADR-0288: Not worth a session is a first-class outcome: restore discretion at the closing leg

## Status

accepted (2026-08-02) — decided and directed by the owner in conversation on 2026-08-02, on the
owner-commissioned factory self-load audit of the same day. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask. The owner directed the outcome ("make 'not worth
a session' a first-class, free outcome at the closing leg, structurally the same move ADR-0168 D1
made for friction capture") and left the mechanism to this ADR.

## Context

**The measurement.** In the 36 hours to 2026-08-02, 88% of sessions (29 of 33) were started by a
prompt another agent wrote rather than by the owner. 16 of 19 agent-minted chips were created within
**four minutes** of their own PR merging — the queue is fed by the merge ceremony, not by discovery
during work. The longest spawn chain ran 11 hops from a single product complaint ("the forrest map
laggs or is choppy when you pan", 2026-07-27), pivoting from product work to pure corpus machinery at
hop 5 and never returning. And 25 of 25 in-window chips were clicked with none dismissed: **the
owner's click is consent, not selection.**

That last number is the load-bearing one. A queue that is not filtered on the way in and not filtered
on the way out is not a prioritisation mechanism at all. There is exactly one place selection can
happen, and it is at mint time.

**The generator is not agent ambition.** All 25 in-window chip prompts and all 336 all-time were
scanned: not one instructs its child to chip the next step. Agents are complying with a standing
rule. The exemplar is unusually clear — the chip that created `claude/hopeful-sanderson-287837`
(PR #1082) states the case *against* its own work, cites the ADR-0024 earns-its-place standard that
would kill it, and writes "'No, leave it' is a first-class, correct outcome" — then spawns a full
session anyway, which decided yes and minted another chip on its way out. The agent reasoned its way
to the right answer and had no way to act on it.

**Where the rule actually lives — and it is not where it looks.** The binding text was assumed to be
ADR-0275 D2. Read precisely, D2 mandates only that the **session must end**; its sole chip language
is in the owner-gated clause, contrasting a chip against a session *waiting* on the owner. D2 never
decided that a follow-up must be queued.

The queue mandate is **ADR-0271 D2(b)**: "follow-up work is *chipped as part of the debrief*, **not
merely mentioned**". That phrase is what forbids a stated decline — under it, mentioning a follow-up
without chipping it is an unfinished ceremony.

The generated `session-orchestrator` guidance then **fused** the two into a sentence stronger than
either ADR alone (`CLAUDE.md:411`): a forked next unit "is NOT a judgment call either — it is a hard
end: chip it into a fresh session rather than continuing or waiting." Three branches are offered,
one is prescribed, and *declining* is not among them. The mandate to queue arrived by elimination,
never by decision. Two sibling clauses carry the same fusion (`CLAUDE.md:399`, `:408`).

**The precedent.** ADR-0168 D1 made exactly this move for friction capture: "'Nothing to report' is a
first-class, FREE outcome — no marker, no penalty," on the reasoning that a compliance gate prices
the ceremony toward theatre. Friction capture is measurably healthy under it — a sample of the ten
newest items graded 9 supported, 1 weak, 0 unsupported.

## Decision

**D1 — Separate the two questions the guidance fused.** They are orthogonal and only one of them was
ever decided:

- *May **this session** do the next unit?* — ADR-0275 D2's hard ends answer this. **Unchanged, all
  four** (a workstream fork, ~3 continuations, degraded context, an owner-gated leg).
- *Must the next unit therefore be **queued**?* — **No.** It is queued only if it clears **this ADR's
  D2 bar** below (not to be confused with ADR-0275's D2, the hard ends above).
  Declining to queue is a first-class, free outcome: no marker, no penalty, no durable record.

A hard end says this session must not carry the work. It has never said the work must exist.

**D2 — The bar: would this be worth a fresh session if it were the only thing on the list?** Price a
session at what one measurably costs here — ~90–120 min wall-clock per PR, of which the repo-wide
gate is 46–52% (ADR-0275 context), plus a slot in the owner's picker and the attention to click it.
Against that, name what it costs to leave the thing undone. **If you cannot name that cost, it is
below the bar.**

The tell is *who surfaced it*, and the 4-minute finding is why:

- **Encountered during the work** — it already cost you something and you can say what. Weigh it on
  the bar normally.
- **Enumerated at the closing leg** because the leg asked "what's next?" — **starts below the bar.**
  Queue it only if you can name the cost of leaving it undone.

*[Narrowed by ADR-0319 (2026-08-06): the second arm covers work the leg **INVENTED** — the follow-up
did not exist until the leg asked, which is the class the 16-of-19 finding measured. It does NOT cover
work the leg **UNBLOCKED**: a parked increment authored earlier on a LIVE arc with no open questions,
which this session's own landed decision made ready. That class clears the bar by default, because its
cost of being left undone was already written on the entry by an author who was not standing at a
closing leg justifying a chip. What is defaulted is only that the lane gets DISPATCHED — the vehicle
stays the session-orchestrator's per-lane call under ADR-0275 D1 Axis 2 (drive it here on a fresh
worktree, or cut a fresh session), so this does not mandate a chip either. The bar itself does not
move, and everything outside that narrow class is priced exactly as this D2 prices it. ADR-0319 D4
also pulls apart the reading error that fed the confusion — an arc RECORDS decided work and dispatches
nobody, so "the arc already carries it" answers ADR-0271 D2(c) and never D2(b).]*

**D3 — Declining is stated, never silent. The debrief is the backstop.** A follow-up considered and
declined is named in the debrief in one line with its reason ("considered X; not worth a session
because Y"). Silence is not permitted and is not what this ADR makes free — *the judgment* is what
becomes free, not the omission. This is what makes the change non-regressive: the debrief already
reaches the owner, so a declined item is surfaced, not dropped, and the owner overturns it with one
sentence. The chip was never the only path to the owner; it was the only path with a session
attached.

**D4 — ADR-0275 D2's hard ends stay; discretion is restored one step later, not at continuation.**
The owner offered the alternative of keeping the hard end for the context-exhaustion and owner-gated
cases while restoring in-session discretion for the **workstream-fork** case. Declined, with reason:

1. It does not address the measured generator. The pathology is not that sessions cannot continue
   onto forks — it is that the queue is auto-fed. Converting chip-hops into in-session hops leaves
   the 11-hop chain intact; it would still pivot from product to corpus machinery at hop 5, just
   **without a chip in the picker to see it happen.** That makes the pathology harder to observe,
   not smaller.
2. D2's fork-end is the only fence against a session wandering off the surface the owner pointed it
   at. Removing it inside an arc whose purpose is to reduce self-directed work would work against the
   arc's own intent.
3. The worth-it gate targets the actual generator at zero context-rot exposure. Slow growth: take the
   cheaper fix that fits the evidence (`asset:slow-growth-minimum-to-green`).

**D5 — A declined follow-up gets no durable record by default.** No friction item, no open question,
no arc entry — the debrief line is the record. A durable-record requirement would rebuild the same
queue in another table, and the corpus already demonstrates that failure: six separate sessions filed
the identical corpus-content-ceiling defect as six new friction items rather than as reinforcements.
If a declined item matters, it will be re-encountered and can be filed then, with fresh evidence
behind it.

**D6 — Amendment edges, stated exactly.**

- **ADR-0271 D2(b)** is genuinely amended: "every follow-up chip created, named by its chip title …
  not merely mentioned" becomes "every follow-up **chipped** — named by its chip title — **or
  considered and declined, with its one-line reason**." D2(a) and D2(c) are untouched; the debrief
  remains mandatory, and a landing without one is still an unfinished ceremony.
- **ADR-0275 D2** is *clarified, not reversed* on three of its four hard ends: it governs the
  session's continuation and never governed whether work is queued. On the fourth it **is** narrowed
  — "owner-gated work always re-enters through a chip" becomes "**when** it re-enters, it re-enters
  through a chip, never by a session waiting on the owner." The anti-waiting rule survives intact.
- **ADR-0275 D3**'s per-landing debrief ("every chip by title") reads through D6's first bullet.
- The rule lives in **two** artifacts, and both change together or the corpus contradicts itself:
  `session-orchestrator` (kind `agent`) and `merge-ceremony` (kind `process`). Both are
  **live-canonical** — edited via `storytree library artifact edit … --pg`; the agent tier's committed
  projections are then regenerated with `pnpm build:guidance && pnpm build:agents`, and `pnpm gate`'s
  `check:guidance` / `check:agents` rungs fail if an edit lands without them. "NOT a judgment call"
  leaves the corpus; `merge-ceremony` step (d) gains the bar, step (e) stops saying a hard end forces
  a chip, and its failure-mode list gains **"Declining a follow-up in SILENCE"** so the new risk is
  guarded where this ceremony keeps its guards.
  *[Mechanism corrected in place 2026-08-06 per ADR-0139 — the DECISION (both artifacts change
  together) is unchanged, so this is not a re-decision. What was overtaken: this bullet described the
  agent tier as seed-canonical per ADR-0055, edited in `knowledge.json` and reconciled with
  `sync-agents --pg`. ADR-0307 D1 superseded ADR-0055 and made the agent tier live-canonical like
  every other tier, and ADR-0302 D1/D4 deleted `knowledge.json` along with the `sync-agents` /
  `sync-corpus` / `export-corpus` ceremonies outright — the commands no longer exist. The "opposite
  edit surfaces" framing went with them: there is now one writer path for both artifacts.]*

**D7 — Falsifiable predictions and a revert rule.** Measured against the arc's follow-on window:
(a) the share of sessions started by an agent-written prompt falls from 88%; (b) the share of chips
minted within four minutes of their own merge falls from 16/19; (c) **debrief coverage of the
follow-up decision stays at 100% of merges** — a merge whose debrief names neither a chip nor a
decline is a refutation, because *silence* is the failure mode this ADR must not introduce. If (c)
fails, restore ADR-0271 D2(b) verbatim by superseding this ADR. If (a) and (b) do not move, the arc
records it as a falsification rather than extending (the arc's own closing condition).

## Consequences

- The tension, recorded honestly as the owner asked. ADR-0275 D2's hard ends exist to stop sessions
  grinding past their competence on degraded context, and that risk is real — this ADR does not touch
  those ends, but it does remove a forcing function that guaranteed follow-up work went *somewhere*.
  The trade is a **measured** cost (a queue nobody filters, at either end) against an **unmeasured**
  risk (worthwhile work quietly judged away). The 25/25-clicked/0-dismissed finding is what makes it
  defensible: mint time is the only remaining place selection can occur.
- **The new failure mode is silence, not over-queuing** — a session that declines everything and says
  nothing. D3 forbids it and D7(c) measures it; that pairing is the whole guard, and it is the thing
  to watch first.
- Agents get their reasoning back. The exemplar chip already contained the correct judgment and could
  not act on it; that is a rule defect, not an agent defect, and it is what this fixes.
- The ADR-0168 D1 symmetry now holds at both ceremonies that ask a finishing session to produce
  something: friction capture and follow-up queuing each have a free, first-class "no".
- Nothing about landing discipline moves. A session still ends its unit at merge, still runs the full
  closing leg, still debriefs, still releases claims, still goes inert or continues per ADR-0275 D1.
- Scope fence honoured: the arc's two sibling recommendations — wiring or retiring the 36 principles
  no agent view cites, and the zero-ceiling `check:corpus-content` that reds sessions on
  sibling-authored drift — are untouched and deliberately not queued here. This ADR does not change
  what either should be.

## References

- **Amends** ADR-0271 (D2(b), the actual chip mandate — "not merely mentioned") · ADR-0275 (D2's
  owner-gated clause narrowed; its four hard ends otherwise intact and re-affirmed by D4).
- ADR-0168 D1 (the precedent: "nothing to report" as a first-class, FREE outcome at friction capture)
  · ADR-0110 (design-time alignment IS ratification — why this ADR is born accepted) · ADR-0055 (the
  agent tier is seed-canonical — why the fix lands in `knowledge.json`, not the live store) ·
  ADR-0024 (the earns-its-place bar the exemplar chip cited against itself) · ADR-0139 (a genuine
  re-decision is a new ADR with `amends` edges, not an in-place rewrite).
- Evidence: owner-commissioned factory self-load audit, 2026-08-02 — 88% agent-started sessions
  (29/33), 16/19 chips minted within 4 min of their own merge, 25/25 clicked / 0 dismissed, the
  11-hop chain from the 2026-07-27 map-lag complaint, 0/336 chip prompts instructing a child to chip.
  Session-cost figures from ADR-0275's audit context (92.4 vs 102–109 min/PR; gate 46–52% of wall).
- Arc: `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (this is its first increment;
  the arc's other two recommendations are owner-held).
- Note on ADR-0275's status: the commissioning brief flagged it as `proposed` on disk while
  `CLAUDE.md` stated its rule as binding. Checked — it is `accepted` on disk and on `main` (flipped
  in `27eea318`, decided 2026-08-01, `amends: [271]`). There was no discrepancy to resolve.
