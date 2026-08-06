---
status: accepted
load_bearing: true
amends: [288]
decided: 2026-08-06
---
# ADR-0319: A just-unblocked lane on a live arc is dispatched by default; the orchestrator picks the vehicle

## Status

accepted (2026-08-06) — confirmed by the owner in conversation on 2026-08-06, in this thread.
ADR-0110 applies (design-time alignment IS ratification); no second end-of-flow ask, and D6's two
guidance edits land in the same PR as this flip.

The confirmation matters procedurally and is recorded rather than assumed. The owner **directed** this
earlier the same day, but in a **different session** — so this ADR was drafted `proposed`, on the
reasoning that ADR-0110's born-accepted rule turns on design-time alignment *in the deciding
conversation*, and reading a directive second-hand out of an agent-memory file is not that. The owner
then confirmed it here, which is what makes it accepted. Had they not, it would have stayed `proposed`
in their queue. The directive, as the receiving session recorded it (2026-08-06): *"why didn't you cut
fresh sessions to drive? if there are no open questions this should be the default behavior."*

The confirmation also **sharpened D2**, and the sharpening is the decision rather than a detail. The
draft read "one fresh session per unblocked lane", which mandates the vehicle. The owner's correction:
*"specifically, the session orchestrator should decide between driving in the same session (setting up
a fresh worktree if needed) or cutting a fresh session."* So what is defaulted is that the lane gets
**dispatched**; **which vehicle carries it is a per-lane orchestration call** — the same call ADR-0275
D1 Axis 2 already made the session's own (*"Cutting a fresh session should be a orchestration model
call not mandated"*), now reaching one case it had not been applied to. D2 below is written as
confirmed, not as drafted, and D7(d) is the falsifier the correction earned.

## Context

**The corpus currently says the opposite, and the contradiction is live.** ADR-0288 D2 (accepted,
`amends: [271, 275]`) decides that a follow-up **enumerated at the closing leg** — because the leg
asked "what's next?" — *starts below* the worth-a-session bar, and is queued only if the session can
name what it costs to leave undone. That is the rule every session reads today, projected verbatim
into `session-orchestrator` step 6(d) and `merge-ceremony` step 9(d). It rests on a real measurement:
16 of 19 agent-minted chips were created within four minutes of their own PR merging, and 25 of 25
in-window chips were clicked with none dismissed — a queue filtered at neither end.

The owner's directive says the default in a specific case is the reverse: close the fork, and every
lane it unblocked gets driven — without being asked. Both cannot be the default for the same case, so
the question this ADR settles is narrow: **does a just-unblocked lane on a live arc clear ADR-0288's
bar by default?** A second, separable question — *by which vehicle* — is answered by D2b, and the two
must not be conflated: the first is a default, the second is a judgment.

**What triggered it, and it is checkable.** A design session landed ADR-0317 (PR #1180, accepted,
owner-directed) which answered `oq-claim-unit-any-addressable-object` — the last open question on
`first-class-edges-arc`. It then chipped nothing, on two stated reasons, and both were false:

- *"the parked increments are already the queue."* An arc entry is a durable record. Nothing reads an
  arc and starts a session.
- *"they sit behind two prerequisites."* Read against the entries' own text on the live arc, there
  were **three independent lanes**, not a queue:
  `claim-audit-log-read-verb` — "(increment 1, UNCONDITIONAL)";
  `typed-resolvable-claim-namespace` — "(increment 2, UNCONDITIONAL)";
  `capability-coverage-report-and-claimable-substrate` — "HARD DEPENDENCY on increment 2 … **for the
  CLAIMABLE half only — the report half depends on nothing and can go first.**"
  The ordinal numbering read as a chain; the sentences underneath it did not.

The same session wrote "real work that nobody has scheduled yet" into its own ADR and then declined
to schedule it. After the owner's correction, two of the three lanes landed the **same day** — PR
#1183 (the report half) and PR #1184 (increment 1) — which is the evidence that they were genuinely
ready, not that they were made ready by asking.

**Why the existing tell mis-fires here.** ADR-0288 D2's tell is *who surfaced it*, and its two arms
are "encountered during the work" versus "enumerated at the closing leg". The 4-minute finding is
about follow-ups that **did not exist until the leg asked** — the leg invented them, so nothing
outside the ceremony vouches for them. A parked increment on a live arc is a different object: it was
authored days earlier (2026-08-05, here), it carries its own motivation and cost, an accepted ADR
already recommended it (ADR-0310 D3), and the closing session did not invent it — it **unblocked**
it, by making the decision the entry was waiting on.

So the tell was doing double duty. It reads as "who surfaced it" but the load-bearing question
underneath is *did this work exist, and was it justified, before this ceremony asked?* The two come
apart exactly once: when the session's own decision is what changed a pre-existing entry's state from
blocked to ready. Both classes surface at the same moment in the ceremony, which is why one was being
scored as the other.

**Nothing in ADR-0288 forecloses this.** Its D1 is the key: it *separated* two questions the guidance
had fused — *may this session do the next unit?* (ADR-0275 D2's hard ends, unchanged) and *must the
next unit be queued?* (D2's bar). This ADR touches only the second, only for one class, and D1's
separation is what makes that possible without disturbing the first.

## Decision

**D1 — ADR-0288 D2's closing-leg arm is narrowed to work the leg INVENTED.** Its tell keeps both arms
and gains the distinction that was implicit in the evidence behind it:

- **Invented at the closing leg** — the follow-up did not exist until the leg asked "what's next?".
  **Starts below the bar. Unchanged.** This is the class the 16-of-19 finding measured, and it is
  where the discretion ADR-0288 restored keeps doing its work.
- **Unblocked at the closing leg** — the follow-up already existed as a parked increment on a live
  arc, and this session's landed decision is what made it ready. **It clears the bar by default**:
  the cost of leaving it undone is already written on the entry, by an author who was not standing at
  a closing leg being asked to justify a chip.

The bar itself does not move. ADR-0288 D2's question — *would this be worth a fresh session if it
were the only thing on the list?* — is unchanged for everything else, and a session that cannot point
at a pre-existing entry is not in this class.

**D2 — The default after closing a fork: every unblocked lane is DISPATCHED, and the orchestrator
picks each lane's vehicle.** Two halves, and only the first is a default:

**D2a — What is defaulted: the dispatch.** A lane meeting all four preconditions gets dispatched
rather than left parked. Each precondition is checkable rather than judged:

1. The lane is a **parked increment on a LIVE arc**, authored before this session's decision.
2. The arc reports **no open questions** — `storytree arc show <id> --pg` prints its derived
   `## Open questions` section, and the owner's condition was literally *"if there are no open
   questions"*. A lane on an arc still waiting on the owner is not dispatched; that arc is waiting.
3. The entry's **own dependency sentence** says nothing outstanding blocks it (D3).
4. This session's landed decision is what unblocked it — a lane that was already ready before this
   session started is ordinary ADR-0288 work, not this rule.

**D2b — What is NOT defaulted: the vehicle. That is the session-orchestrator's call, per lane.** Two
vehicles, both first-class, neither mandated:

- **Drive it in this session.** The moment repo code is touched, stand up a fresh worktree on a fresh
  branch cut from freshly-fetched `origin/main` and re-declare claims at ADR-0270 grain — mechanical
  and mandatory, never judged (ADR-0275 D1 Axis 1). A session may hold more than one worktree over its
  life (owner, 2026-08-05), so needing a fresh worktree is a setup step, never a reason to hand off.
- **Cut a fresh session** (`asset:session-cutting`) — the owner-approved chip, which outlives this
  session and starts with clean orientation.

The choice is the one ADR-0275 D1 Axis 2 already assigns to the session: its own remaining context
headroom, plus ADR-0275 D2's hard ends. **A hard end removes the first vehicle for that lane; it never
removes the dispatch** — that separation is ADR-0288 D1's, and it is what lets the two rules compose.
A session with room drives; a session that has spent its context deciding hands off, which is the
original `land-decisions-then-cut-a-fresh-session` judgment rather than an exception to it.

**One vehicle per lane, never one vehicle for the set.** A single chip saying "do all three"
serialises work that is parallel by construction, which is the coupling these arcs exist to remove; a
chip per lane also lets the owner click one, some, or none, so their selection survives. The same
constraint binds the in-session vehicle and is the easier half to get wrong: **drive at most one lane
in-thread and give the rest their own sessions.** Taking all three in-thread re-creates the very queue
this ADR unwinds — a serial chain wearing a different hat — and ADR-0275 D2's ~3-continuations guard
is a context-rot backstop, not a licence to run the lanes one after another.

**D3 — Count the lanes by reading each entry's own dependency sentence, never by its ordinal.**
Increment numbering records the order entries were authored, not a dependency chain. Increments 1, 2
and 3-report-half above were mutually independent while reading as 1 → 2 → 3. The instruction is
mechanical: open each parked entry, find the sentence that states its dependency, and take that
sentence at its word — including when it says a *half* of an increment can go first.

**D4 — "The arc already carries it" is not a reason to decline. Parked is not dispatched.** An arc
**records** decided work; it does not **dispatch** anyone. Nothing reads an arc and starts work: a
lane moves only when a session drives it (D2b's first vehicle) or when a fresh session is started by
a chip the owner clicks (`asset:session-cutting`) or by the owner typing. Neither of those happens
because an entry exists. ADR-0271 D2 is where this went wrong, and it is a reading error rather than
a defect in D2:
part **(c)** asks *what remains open and where it lives (arc / ADR / chip)*, and part **(b)** — as
amended by ADR-0288 — asks for a chip **or** a stated decline. An arc entry answers (c). It has never
answered (b), and a debrief that offers it as the answer to both has skipped (b) in silence, which
ADR-0288 D3 already forbids.

**D5 — Scope fence: this binds a session that CLOSED A FORK, and nothing else.** Stated exactly,
because the memory this ADR graduates carries the same fence and it was earned:

- **This does not mandate a hand-off, and D2b is the guard.** The failure this ADR fixes is a lane
  left parked, never "a session that kept working". ADR-0275 D1 Axis 2 is untouched and is the rule
  D2b applies: standing up a fresh worktree is mechanical and mandatory (Axis 1), while *whether to
  drive it here or hand off* is the session's own call on its context headroom — the owner's words,
  2026-08-01: *"Cutting a fresh session should be a orchestration model call not mandated."* And a
  session may work more than one worktree over its life (owner, 2026-08-05). Over-reading this ADR
  into "code work ⇒ new session" is the failure the fence exists to stop, and it is the reading the
  draft's own "one fresh session per lane" wording invited before the owner corrected it.
- **Not a general lowering of ADR-0288's bar**, and not a reopening of the chip freeze, which was
  lifted 2026-08-05. Everything outside D1's unblocked arm is priced exactly as ADR-0288 prices it.
- **Not a weakening of ADR-0275 D2's hard ends.** All four stand. They compose with this cleanly
  *because* ADR-0288 D1 split the questions: at a hard end this session must not carry the lane, so
  D2b's first vehicle is off the table for it — and the separate question of whether the lane is
  dispatched at all is answered here, with: yes, per lane, by chip.
- **Silence stays forbidden (ADR-0288 D3).** This ADR makes a *default*, not an automation. A session
  that judges a lane genuinely not worth dispatching says so in one line with its reason — and checks
  the reason is true first, which is the whole lesson of the triggering incident. The debrief also
  records which vehicle each dispatched lane got and why, so the owner always learns what the session
  kept and what it handed off (ADR-0275 D1's standing requirement).
- **Not a dispatch-rate ceiling in the other direction either.** Three ready lanes get three vehicles;
  where the vehicle is a chip, the owner's click remains the selection gate
  (`asset:human-owns-the-outer-loop`), and nothing here lets a session self-approve a spend or an
  attestation it could not otherwise make.

**D6 — Where the rule lands, and both surfaces change together or the corpus contradicts itself.**

- `session-orchestrator` (kind `agent`) step 6(d) — the bar's sentence gains D1's unblocked arm, D2b's
  vehicle fork, and D4's one-liner. **The agent tier is LIVE-canonical (ADR-0307 D1, superseding
  ADR-0055):** edit via
  `storytree library artifact edit session-orchestrator --pg`, then regenerate the committed
  projections with `pnpm build:guidance && pnpm build:agents`. ADR-0288 D6's final bullet describes
  the retired three-step seed→sync→render mechanism; that prose is overtaken and is corrected in
  place under ADR-0139, since ADR-0288's *decision* is unaffected by how its edit is applied.
- `merge-ceremony` (kind `process`) step 9(d) — the same additions, landing beside step 9(e)'s
  existing continue-or-inert fork rather than duplicating it, since D2b IS that fork applied per lane.
  Its failure-mode list gains **"Leaving a lane the leg UNBLOCKED parked because 'the arc already
  carries it'"**, next to the existing "Declining a follow-up in SILENCE".

**D7 — Falsifiable prediction and a revert rule, and deliberately NOT the two retired metrics.**
`factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` closed on the finding that
ADR-0288's own closing metrics are **bad instruments** — agent-started-session share and
machinery-share of filed friction both measure VOLUME where the meaningful variable is CONCENTRATION,
and the first counts *who wrote the opening prompt*, not who decided the work. This ADR does not
re-run either, and a successor must not read a moving number there as settling anything.

What is measured instead, per fork-close:

- **(a)** The owner does not have to ask *"why didn't you cut fresh sessions?"* again. A repeat of
  that question is a direct refutation, and it is the only signal the owner actually raised.
- **(b)** Lanes dispatched **by chip** are clicked or explicitly left, not silently ignored. Under the
  old 25/25-clicked/0-dismissed reading a click was consent rather than selection; a lane the owner
  declines to click is now the honest, cheap, reversible signal that D1's default is too wide. This
  measures only the chip vehicle — an in-session lane never reaches the picker, which is a reason to
  read (b) as a lower bound, not a reason to force the chip vehicle to keep the metric clean.
- **(c)** A lane dispatched under D2 that turns out to have been blocked refutes **D3's counting
  rule**, not the default — the remedy is a sharper reading procedure, not withdrawing the default.
- **(d)** Lanes driven in-session land **in parallel with**, not serially behind, their siblings. The
  refutation is a session that takes every lane in-thread one after another: that is the queue this
  ADR unwinds, re-created inside one session, and D2b's one-lane-in-thread rule is what it breaks.

If (a) fails, restore ADR-0288 D2 verbatim by superseding this ADR. If (b) shows the owner routinely
leaving these chips unclicked, narrow D2a's precondition 1 from "a parked increment" to "a parked
increment an accepted ADR recommends as next". If (d) fails, D2b's vehicle choice is what to constrain
— back to the draft's mandated chip — not D2a's dispatch.

## Consequences

- **The tension, stated honestly.** This ADR dispatches work at precisely the moment ADR-0288 measured
  the closing leg to be least trustworthy — minutes after a merge, with the ceremony asking "what's
  next?". The guard is that the class is narrow and every precondition is checkable against something
  authored *outside* the ceremony: the entry pre-exists the decision, the arc is live and unblocked,
  and the entry's own sentence says it is ready. A session that cannot cite those is back under
  ADR-0288's bar. The residual risk is a session that manufactures the citation, and (b) is what would
  surface it. D2b lightens the tension without resolving it: the in-session vehicle costs no picker
  slot and no owner click, so on that vehicle the only thing at stake is the session's own attention.
- **The class this covers is small by construction and should stay that way.** It needs a live arc, a
  parked increment authored earlier, an owner-answered fork, and a landed decision. If sessions start
  reporting most follow-ups as "unblocked lanes", D1 has been widened by usage and (b) should catch
  it.
- **A decision session's obligation grows by one concrete step, plus one judgment.** The step is
  mechanical: after landing the ADR, open the arc, read each parked entry's dependency sentence, and
  dispatch what is ready — the step the triggering session skipped, and it is cheap. The judgment is
  D2b's, per lane, and it is a judgment the session was already making elsewhere (ADR-0275 D1 Axis 2)
  rather than a new one.
- **What is binding is *that* the lanes are dispatched, not *who* drives them.** A session with
  context headroom may stand up a fresh worktree and take one lane while chipping the rest; a session
  that has spent its context deciding chips all of them. Both are correct. What neither may do is
  leave a ready lane parked, or run the lanes serially in-thread.
- **The agent-memory silo closes.** `land-decisions-then-cut-a-fresh-session` carried this correction
  alone while an accepted ADR said the opposite — a fact only sessions that happened to load that
  memory could know, which is exactly the failure mode a memory silo is. It was parked on a 30-day
  graduation lease by the librarian pass that flagged the conflict; that lease is discharged here, and
  the memory's `★★` section prunes to a pointer at this ADR (ADR-0095 D4/D6/D8). What stays in the
  file is what did NOT graduate: the 2026-08-03 land-the-context-on-an-arc directive and the
  cwd/scaffolding trap, neither of which this ADR decides.
- **Nothing about landing discipline moves.** The gate, the librarian pass, the non-draft PR, the
  closing leg's order, claim release, and inert-is-not-mute are all untouched.

## References

- **Amends** ADR-0288 — D2's closing-leg arm is narrowed to *invented* follow-ups; D1's separation of
  "may this session continue?" from "must this be queued?" is what this ADR builds on and leaves
  intact; D3 (declining is stated, never silent) and D5 (no durable record for a decline) stand.
  ADR-0288 D6's mechanism prose for editing `session-orchestrator` is corrected in place per ADR-0139
  (ADR-0307 D1 retired the seed-canonical agent tier ADR-0055 described).
- ADR-0271 D2 (the debrief's three parts — (b) chip-or-decline and (c) where it lives are different
  questions, which D4 above pulls apart) · ADR-0275 D1 Axis 1/Axis 2 and D2 (unchanged, and *applied*
  rather than amended: Axis 2 is the vehicle call D2b hands the orchestrator, Axis 1 is the mandatory
  fresh worktree inside it, and the four hard ends stand — see D5) · ADR-0303 (an escalation is a landing, not a wait — the
  never-wait invariant this ADR does not touch) · ADR-0110 (design-time alignment IS ratification, in
  the deciding conversation — why this ADR is `proposed`) · ADR-0139 (correct in place when the
  decision has not changed) · ADR-0307 D1 (the agent tier is live-canonical — D6's edit path) ·
  ADR-0095 (memory graduation — why the silo prunes on acceptance) · ADR-0168 D1 (the free-outcome
  precedent ADR-0288 followed) · ADR-0310 D3 and ADR-0317 (the fork closed at the triggering
  incident).
- Evidence: `first-class-edges-arc` on the live store, read 2026-08-06 — three parked entries whose
  own text reads "(increment 1, UNCONDITIONAL)", "(increment 2, UNCONDITIONAL)", and "the report half
  depends on nothing and can go first"; increment log #1180 (decision landed, no code), then #1183 and
  #1184 the same day. ADR-0288's own evidence: 16/19 chips within four minutes of their own merge,
  25/25 clicked / 0 dismissed. The retired-metric finding: closing note of
  `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, 2026-08-04.
- Library: `asset:session-cutting` (the dispatch mechanism), `asset:merge-ceremony` step 9(d),
  `session-orchestrator` step 6(d) — the two artifacts D6 changes.
- Arc: **none.** The arcs that own session-lifecycle discipline — `end-at-merge-arc` (ADR-0271/0275/
  0303) and `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (ADR-0288) — are both
  closed, and no live arc produced this decision; an owner correction did. Stamped arc-less rather
  than reopening a closed arc or mis-homing on a live one (precedent: ADR-0309, ADR-0315). A successor
  that wants this territory should charter it rather than inherit it.
