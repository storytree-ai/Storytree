---
status: accepted
decided: 2026-08-06
arc: context-decision-tree-arc
amends: [260]
---
# ADR-0318: Membership is the agreement that matters: the offer-set order divergence is pinned, not repaired

## Status

accepted (2026-08-06) — decided/directed by the owner in conversation on 2026-08-06, choosing option A ("pin it, change nothing") from the four presented. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends ADR-0260, which stands and is not superseded. Every decision in it survives intact; what this ADR closes is a question its Consequences left explicitly open — *"Making the two agree is a DECISION, not a repair, and it is OPEN."* It is now settled, and settled in the direction of changing nothing.

## Context

`context-decision-tree-arc` records what the Library OFFERED a session at each read, so a replay can show the branches not taken. ADR-0260 D1 records the offer set at render time; increment 7 (#1172, capability `offer-set-render-agreement`) asked the question every earlier increment had begged: **is the recorded offer set actually what the artifact offered?** Every capability before it verified a read against the traversal's own account of what it was shown, which is circular with respect to this arc's end state.

The check spawns the real CLI, parses the offer ids out of that process's OWN printed `Sources:` block, and compares them against the trace read back from disk. Neither side is derived from the other; the comparator imports nothing from `offer-candidate-sets.ts` and never reads `doc.references`. Measured over the live corpus (1125 artifacts, 357 carrying at least one reference, 280 carrying two or more), the result is two-sided:

- **MEMBERSHIP AGREES, everywhere — zero divergences.** No id is dropped, added, or altered by either path on any artifact in the corpus. This is the substantive result and it is D1's premise: the recorded offer set really is what the artifact offers, so nothing downstream is reasoning about a set the reader was never shown. It is what closed the arc's last end-state clause.
- **ORDER DIVERGES on 177 of the 280 multi-reference artifacts (63%).** `resolveArtifactOffers` records `references` in AUTHORED order; the `Sources:` block prints them REGROUPED by target type into `SOURCE_GROUP_ORDER` (`packages/library/src/knowledge-sources.ts`), keeping authored order only *within* a group.

**No verdict moves with it, and that is checked rather than assumed.** Every `candidateNodeIds` consumer in the repo is set-based, count-based, or an order-preserving `.map` used only for display. ADR-0235 clause 3 independently bans ordering as evidence of causation, so a position-based join is already forbidden. **The entire cost is presentational: the replay lists branches in a sequence the agent did not see on screen.**

**"Make the recording match the render" does not name a target, and this is the trap the fork turns on.** The same envelope already prints the offer in TWO different orders. `renderOfferFollowUps` (`follow-offer-edges.ts:122`) iterates `references` directly — AUTHORED order, minus every scheme-prefixed id it skips — while the `Sources:` block above it is GROUPED. The telemetry agrees with the follow-up list and disagrees with the Sources block. There is no single "the render" to match.

**What each surface is pinned by, established by reading the legs rather than assumed.** This table is the load-bearing input to the decision, because three of the five entries turned out to be unpinned and one is pinned verbatim in the direction a repair would have to break:

| surface | order | pinned by | signed? |
| --- | --- | --- | --- |
| telemetry `candidate_set.candidateNodeIds` | authored | UAT leg 7 `an-artifact-read-records-the-branches-not-taken` — a verbatim `assert.deepEqual` on `plan`'s four ids, message *"every offered ref must be recorded, in authored order"* | **YES** — story-level `real.testFile` |
| printed `Sources:` block | grouped | `packages/library/src/knowledge-sources.test.ts`, two tests | no — ordinary package tests |
| printed follow-up commands | authored | leg 8 locates its line with `.find()` | **not pinned** |
| replay `decision points:` block | recorded | leg 9 uses `.some()` / `.find()` / count equality, never a positional index | **not pinned** |
| the divergence itself | — | `offer-set-render-agreement.test.ts` (`orderAgrees`) | **YES** — capability `real.testFile` |

**One architectural fact bears on the option that looks cheapest.** `decision-point-playback.ts` states, and holds, that it consumes only the events it is handed: *no filesystem, no clock, no store, no trace reader, no id generation*. Regrouping at replay time requires resolving each asset id's category against the corpus, which surrenders that property.

## Decision

**Membership is the agreement that matters. The order divergence is PINNED as known state and is not repaired — no code changes.**

1. **The recorded offer set is authoritative on MEMBERSHIP and makes no claim about ORDER.** Zero-divergence membership is what D1's premise needed and what the arc's end state turned on. Offer position carries no meaning anywhere in this telemetry, and this decision declines to give it one.

2. **The divergence is asserted by a signed test, not merely documented.** `offer-set-render-agreement.test.ts` already computes `orderAgrees`, so the divergence is a *checked fact* rather than an unnoticed one. This is the same move ADR-0312 D5 made for the `list` divergence, on the same reasoning: a silent divergence is how the next drift starts. A prose caveat alone would not survive either path being edited.

3. **Nothing may begin joining on offer position.** This is the condition that would reopen the decision. ADR-0235 clause 3 already bans ordering as evidence of causation; D1 above extends that from *causation* to *identity* — a consumer that treats `candidateNodeIds[i]` as meaningful is introducing a claim this decision says the data does not support. If such a consumer is ever wanted, it needs its own ADR and it must reconcile the two paths first, not after.

4. **`renderOfferFollowUps` keeps authored order and the `Sources:` block keeps its grouping.** Both are deliberate, and the fact that one envelope prints two orders is accepted rather than resolved. The grouping exists because it makes the most-read surface in the repo legible; the follow-up list is authored because it is a paste list, not a ranking.

5. **ADR-0260 D4 is untouched and unengaged.** Comparing a recorded set against the render that produced it repairs no missing edge, draws no edge the telemetry did not record, and infers nothing. Under-reporting remains the accepted failure mode.

6. **If the replay is ever made to reflect the render, the direction is option D and not option B** — the replay's own render layer, which no signed leg pins. That change must engage the corpus-free replay property in D2 of its own ADR rather than spending it silently. This clause names the direction so a future session does not re-derive it from the losing end.

### What was weighed

**Option A — pin it, change nothing. CHOSEN.**

- Costs nothing and breaks nothing; it is already the built state, now made deliberate.
- The defect is one sentence long: the replay lists branches in a sequence the agent did not see. Every repair costs structurally more than that.
- Leaves the imperfection standing and visible, which is this arc's established posture on gaps it declines to close (ADR-0312 D2 refused the `doc:` read shape on the same shape of reasoning).

**Option B — make the telemetry match the grouped Sources block. Refused.**

- Breaks signed UAT leg 7 directly: its `deepEqual` pins `plan`'s four ids in authored order, and the `doc:` ref sits FIRST there while `SOURCE_GROUP_ORDER` puts the Decisions bucket near the end, so the assertion fails on its first element and the story-level UAT must be deliberately re-proved.
- Couples the producer to a render concern: `groupSources` needs a corpus-resolver callback to place an `asset:` id, which `offer-candidate-sets.ts` deliberately does not take.
- **And it does not eliminate the divergence — it relocates it.** The telemetry would newly disagree with the follow-up list it currently matches. Fixing that too widens the change to a third surface.

**Option C — make the `Sources:` block match authored order. Refused.**

- Cheapest in proof terms: it breaks only the two unsigned `knowledge-sources.test.ts` tests.
- But it destroys the Definitions / Guardrails / Decisions / Other grouping on the primary human- and agent-facing Library read surface, which every `library artifact <id>` invocation prints — degrading the most-read surface in the repo to fix a presentational detail in a replay. It also forces a rewrite of the `offer-set-render-agreement.ts` oracle, which parses the group headers.

**Option D — regroup at the replay's render layer only. Refused now, named as the direction if ever.**

- Breaks no signed leg (leg 9 is order-insensitive) and fixes the cost exactly where it lands.
- **Refused because it trades a stable presentational wrong for an unstable one.** Grouping requires the corpus, so a replay would render yesterday's trace against today's corpus and could draw the same trace differently as the corpus moves. For a surface whose entire purpose is to be trusted about what a session was shown, that is the worse failure.

**The premise itself was questioned, and this is why A is chosen rather than merely cheapest.** "The order the agent saw" is not well-defined: the agent saw the offer twice in one envelope, grouped and authored. Electing either as canonical asserts a fact about what a session attended to that nothing measured supports — the exact class of unmeasured assertion ADR-0235 clause 3 and ADR-0260 D3 both exist to fence out. A repair here would have been this arc violating its own discipline in the name of tidiness.

## Consequences

**The arc's build worklist and its end-state clauses are both fully answered.** Membership agreement closed the last clause in increment 7; this decision closes the fork that clause opened. Closure of the arc itself remains the owner's call and is not taken here.

**The `orderAgrees` assertion changes meaning: it is now a REGRESSION DETECTOR, not a finding.** It previously recorded an open divergence awaiting a decision. It now pins accepted state, and a future run where the two paths silently *converge* is as much a signal as one where they diverge further — either means something edited a path this ADR says is stable.

**A future session finding the two orders different should not read it as unfinished work.** This is the same withdrawal ADR-0312 made for the `doc:` gap, and it is stated for the same reason: the previous wording invited a later increment to "fix" it. A proposal to reconcile the paths must engage D3 and D6 above rather than treating the divergence as residue.

**The `Sources:` block's grouping is now load-bearing on a decision, not merely on taste.** D4 makes it a recorded choice that the most-read surface optimises for human legibility while the telemetry optimises for fidelity to what was authored. Anything that flattens the grouping is now a change to this decision.

**Not in scope, unchanged.** Acting on the resulting evidence — ranking, prefetch, or any change to what context gets pulled — stays outside this arc, on the line ADR-0235 clause 7 holds. The GUIDANCE change ADR-0260 reaches (agents actually re-using the offered `--from-offer` form) is untouched by this decision and remains outstanding as its own owner item.

**The open question `offer-set-order-divergence` is drained by this ADR** (retired, superseded-by), per the lifecycle tier's mandatory-drain rule. It existed for one day and its whole content is preserved above.

## References

- ADR-0260 — the decision this amends: offers carry an identity and the answering command names it. Its Consequences' *"Making the two agree is a DECISION, not a repair, and it is OPEN"* clause is annotated in place as settled by this ADR (ADR-0139 correction, 2026-08-06). D4 (under-report, never repair) stands and is unengaged.
- ADR-0312 — the sibling amendment to ADR-0260: the `doc:` blind spot is measured, not closed. D5's treatment of the `list` divergence is the precedent D2 above follows.
- ADR-0235 — clause 3 bans ordering as evidence of causation, which is why no verdict moves with this divergence; clause 7 holds observability before behaviour change.
- `packages/context-traversal-capture/src/offer-set-render-agreement.ts` — the independent oracle, and `orderAgrees`, the assertion D2 turns on.
- `packages/context-traversal-capture/src/decision-point-playback.ts` — the corpus-free replay whose property option D would have spent.
- `packages/context-traversal-capture/src/follow-offer-edges.ts` — `renderOfferFollowUps`, the second, authored-order render in the same envelope.
- `packages/library/src/knowledge-sources.ts` — `groupSources` / `SOURCE_GROUP_ORDER`, the grouped render D4 preserves.
- `packages/context-traversal-capture/src/terminal-capture.uat.test.ts` — legs 7, 8 and 9; the pins table in Context is read off this file.
- Arc `context-decision-tree-arc` — the initiative this ADR is filed under; increment #1172 is the measurement it settles.
