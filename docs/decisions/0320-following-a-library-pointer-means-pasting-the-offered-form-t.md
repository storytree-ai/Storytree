---
status: accepted
decided: 2026-08-06
arc: context-decision-tree-arc
amends: [260]
---
# ADR-0320: Following a Library pointer means pasting the offered form: the decision tree's thinness is guidance debt

## Status

accepted (2026-08-06) — decided/directed by the owner in conversation on 2026-08-06 ("stamp it then drive"), after the measurement below was put in front of them. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends ADR-0260, which stands and is not superseded. What it overtakes is one line in that ADR's Consequences — *"Still not delivered: the GUIDANCE change this decision reaches"* — which has been true across all eight increments of this arc and is now decided and scheduled.

## Context

ADR-0260 D3 settled how a followed edge is attributed: the offer's identity travels in **argv**, so a `library artifact <id>` render prints pasteable follow-up commands carrying `--from-offer <candidateSetId>`, and the answering process stamps the edge itself. D4 accepted **under-reporting** as the failure mode — an agent that types the bare command produces a read with no edge, and no pass may repair it by correlation.

That ADR's Consequences flagged the residual honestly: *"The agent-facing command surface changes, so this decision reaches guidance as well as code."* It was never delivered. Three build increments (#1003, #1005, #1143), two measurement increments (#1165, #1172) and a settlement (#1182) landed around it.

**The residual was measured on 2026-08-06 rather than estimated, over the real traces on the owner's dev machine (`~/.storytree/traces`) — every session this repo has recorded:**

| quantity | count |
| --- | --- |
| session trace files | 274 |
| sessions carrying at least one offer | 112 |
| `candidate_set` events recorded | 909 |
| **offered ids across those sets** | **5048** |
| **`followed_edge` events** | **0** |

**The producer half works and has been recording for weeks; the answering half has never fired outside tests.** Every decision point in every real replay renders each branch `not-followed` or `unobservable`. The surface is HONEST — that is exactly D4 working as designed — but it is empty of the one thing this arc exists to show: a branch an agent actually chose, distinguishable from one it never considered.

**The cause is not a missing mechanism, and this is the finding that makes the decision easy.** A corpus-wide search for `--from-offer` returns CLI implementation (`commands.ts`, `main.ts`, `at-path.ts`), its own tests, and ADRs 0260 / 0312 / 0318. **Zero guidance artifacts mention it.** No agent has ever been told the form exists, what it is for, or that anything reads the result. A behavioural ask that was never asked is not evidence that agents decline it.

**The cost is also smaller than ADR-0260's "a behavioural ask on every agent" phrasing suggests**, because the CLI already prints the exact line in its `next:` block at the moment of the read:

```
next:
  - storytree library artifact arc --from-offer candidate-set:6c1c0b25-...
  - storytree library artifact anchor-implementation-surface --from-offer candidate-set:6c1c0b25-...
```

The ask is to paste a line that is already on screen instead of retyping a shorter one. It is not a new ceremony, a new file, or a new tool.

## Decision

**Following a pointer the session was just offered means pasting the offered form. The trace's thinness is guidance debt, and it is now scheduled.**

1. **The guidance change is AUTHORIZED and is this arc's next increment.** ADR-0260's "still not delivered" is discharged as a decision; the delivery is a build.

2. **It is DISCIPLINE, not a gate.** No compliance rung, no `check:*`, no counter that reds a build. ADR-0168 D1 found that pricing a ceremony behind a compliance gate drives it toward theater, and ADR-0314 D5 made the same call for escalation authoring; the same reasoning binds here, and more strongly, because a gate on "did you paste the offered form" would reward pasting it where no offer was actually followed — manufacturing exactly the false edges D4 refuses.

3. **ADR-0260 D4 is untouched and unengaged.** Guidance raises the FILL RATE; it never repairs a missing edge. A bare read still draws no decision point, no backfill or correlation is licensed by this decision, and an agent that skips the form is not in breach of anything — it produces a thinner trace, which is the accepted cost.

4. **Scope: it binds a read that ANSWERS an offer the session was just shown.** It does not bind a first read, a search, a read reached from a chip or a task prompt, or an artifact opened for any other reason. There is no offer to name in those cases, and naming one anyway would be fabrication of the precise kind D3 refused when it rejected trace-side resolution.

5. **The rule must reach agents at the moment of the read, not only in a document they may never open.** This ADR does not pick the surface — that is the increment's decomposition — but it fences the failure mode: a rule that lives only in a Library artifact nobody pulls reproduces the present state, in which the mechanism is fully built and fully unused. The envelope that already prints the follow-ups is a surface an agent provably reads.

6. **The change is FALSIFIABLE, and the baseline above is the pin.** 5048 offers / 0 edges, 2026-08-06. The increment that lands the guidance states the fill rate afterwards, measured the same way. Without a stated baseline this becomes unmeasurable and a future session re-runs this same discovery.

7. **If the fill rate stays near zero after the guidance lands, that is a FINDING, not a retry.** It would mean the behavioural ask does not survive contact with real sessions, which is decision-relevant rather than an implementation defect: it reopens ADR-0260's candidate A (within-process offers only, which records machine-resolved descent rather than agent choice) as the honest ceiling of this telemetry. Do not respond to a flat number by adding a gate — that is D2's refusal, and it would buy compliance rather than signal.

## Consequences

**The arc's picture can become non-empty for the first time.** Everything else it needs has been built and signed since #1143; this is the only remaining input.

**A baseline now exists where none did.** The 5048/0 measurement is worth keeping for its own sake: it is the first quantity anyone has attached to the question "does the offered-form mechanism get used", and it was assumed to be "rarely" rather than known to be "never".

**The behavioural dependency ADR-0260 D7 declared becomes visible in the numbers rather than only in prose.** `FOLLOW_OFFER_EDGE_CAVEATS` carries `follow-completeness-depends-on-the-offered-command-form`; that caveat has been literally 100% binding this whole time, and nothing said so.

**Do NOT read this as licensing a richer join.** The reason the trace is thin is agents not naming the offer, and the fix is agents naming the offer. Correlating reads to recent offers remains fenced twice (ADR-0235 clause 3 and ADR-0260 D3), and ADR-0318 D3 additionally forbids treating offer POSITION as meaningful.

**Not in scope, unchanged.** Acting on the resulting evidence — ranking, prefetch, or any change to what context gets pulled — stays outside this arc, on the line ADR-0235 clause 7 holds. This decision changes how a read is INVOKED, never what gets read.

**DELIVERED 2026-08-06, and the counter is off zero for the first time.** D5 left the surface to the increment and fenced only the failure mode; the increment chose **three surfaces, each holding what only it can hold**, and the reasoning is recorded here because D5 made it the increment's main decision.

- **The envelope's `note:` stanza — the load-bearing surface.** An agent mid-read will not pull a second artifact to learn how to follow the first, so no Library-only rule could have reached the moment of the decision. `OFFER_FOLLOW_NOTE` (beside `renderOfferFollowUps`, so the form and the ask about the form share one home) now renders immediately above the follow-ups, and only where follow-ups were actually produced — an artifact whose refs are all `doc:` offers nothing followable and gets no ask.
- **`library-edit-ceremony` step 1 + trigger — the durable home, and the removal of an ACTIVE SUPPRESSOR.** This is the finding worth keeping: that artifact instructed *"Add `--pg`"* to reads, on the ground that a bare read "answers from a frozen bootstrap fixture". That ground is FALSE post-ADR-0302 D1, and the instruction was not merely stale — `isOfferableArtifactRead` matches the bare three-token shape ONLY, so `--pg` on a read mints no offer at all. Measured 2026-08-06: bare and `--pg` reads of `trunk` are byte-identical except that `--pg` drops the follow-up line. Standing guidance was suppressing the mechanism this arc exists to feed. Corrected in place per ADR-0139 (the decision did not change; the claim went false).
- **`CLAUDE.md` — the same false claim**, in the hand-authored Library CLI bullet, contradicting its own Library section thirty lines above. Corrected in place.

**No new Library artifact was authored** (`asset:edit-first-curation`): the sweep spanned `process`, `pattern` and `principle`; the closest candidates were `pull-based-context-architecture` (a legacy-imported briefing pattern — wrong altitude for CLI mechanics), `subagent-context-pull` (scoped to a spawned prompt's shape) and `library-edit-ceremony`, which despite its name is the only artifact whose steps document Library CLI read invocation and whose step 1 is titled *Explore*.

**D6's post-change number, measured the same way.** Baseline re-ran EXACTLY before the change (275 files / 113 with offers / 922 sets / 5112 offered / **0** edges — the deltas from the pinned 274/112/909/5048 are the measuring session's own reads). After: 932 sets, 5154 offered, **2** `followed_edge` events, a corpus fill rate of 0.0388%. Both edges are the measuring session's own, produced after the note existed, and the replay renders `offered 2: followed 1, unobservable 1` — an agent-chosen branch drawn for the first time anywhere outside tests, beside a `not-followed` render of the same node from an earlier bare read. **What this does NOT establish is the thing D7 asks about:** n=1, and the session that measured it also authored the change. The falsifiable number is what a LATER session measures over sessions that never saw this work, and D7 governs how to read it — a flat number is a finding about the behavioural ask, not a licence to add the gate D2 refuses.

**The signed-UAT cost was paid again, deliberately, exactly as ADR-0260 D6 paid it.** `capture-off-leaves-a-byte-identical-envelope` compares a capture-on render against a capture-off one; ADR-0260 D3 had already widened "byte-identical" from whole-stdout to stdout-minus-the-offer-lines, and the ask widens the offer SURFACE again, so the leg now strips the note stanza too — via the exported constant, so re-wording the ask cannot silently break it — and asserts the note present-with-the-offer and absent-without, which is the same present-only-where-genuinely-recorded claim the offer lines already carried. The leg's claim did not move; the surface underneath it did.

## References

- ADR-0260 — the decision this amends: D3 puts the offer id in argv, D4 accepts the under-report, D7 declares the behavioural dependency. Its Consequences' "Still not delivered" line is annotated in place as discharged (ADR-0139 correction, 2026-08-06).
- ADR-0312 — the sibling amendment: the `doc:` blind spot is measured, not closed. Its D2 is the precedent for refusing a fix that would manufacture false verdicts.
- ADR-0318 — the sibling amendment settling the offer-set ORDER divergence; its D3 fences offer position as meaningless, which this decision does not disturb.
- ADR-0168 D1 / ADR-0314 D5 — the precedent for landing a behaviour as discipline rather than as a gate rung.
- ADR-0235 — clause 3 bans ordering/proximity as evidence; clause 7 holds observability before behaviour change.
- `packages/context-traversal-capture/src/follow-offer-edges.ts` — `renderOfferFollowUps` (the printed form) and `FOLLOW_OFFER_EDGE_CAVEATS`.
- `~/.storytree/traces` — the 274 session files the baseline is measured over.
- Arc `context-decision-tree-arc` — the initiative this ADR is filed under; this is the last item on it.
