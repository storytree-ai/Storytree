---
status: accepted
decided: 2026-08-12
amends: [6]
arc: verification-integrity-arc
---
# ADR-0350: An event that caused another says so: causal edges on the event log

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Raised after the owner asked whether [ActiveGraph](https://activegraph.ai/) — an external event-sourced agent runtime published 2026 — represented an architectural step forward for storytree's observability. The research pass found that it did not, as a runtime: its own paper concedes that *"Concurrent or distributed writers, and multi-agent contention over a shared graph, raise ordering questions this paper does not resolve"*, which is precisely storytree's hardest problem and the entire subject of ADR-0200 through ADR-0346. But one primitive in it is not ours and should be: its events carry a `caused_by` pointer, and ours do not. This ADR settles that one primitive and explicitly declines the rest.

**Amends** ADR-0006 — which established the event store as the single source of truth and split v1's fused grain into an append-only log under a derived rollup. All of that stands. What ADR-0006 never settled is whether an event records **what caused it**; it left "event vocabulary — OTel-GenAI vs bespoke" open in its own `## Open` section, and this decision closes one clause of that question without reopening the rest.

## Context

**The substrate is already event-sourced, and that is not the gap.** `packages/library/src/store/schema.sql` opens by declaring ADR-0017's shape — history is an append-only event stream, current state is a projection folded from it — and `upsertDoc` appends-and-projects atomically (`packages/storage-protocol/src/store.ts`). Eleven append-only history streams are live: `library_event`, `comment_event`, `suggestion_event`, `user_event`, `work_event`, `verdict`, `usage_event`, `attestation`, `uat_drive`, `change_event`, `claim_event`.

**No event in any of them records what caused it.** `StoreEvent` carries `seq, id, kind, type, doc, actor, at`. Verified 2026-08-12 by grep across `packages/` and `apps/` for `caused_by` / `causedBy` / `causeEventId` / `parentEventId`: **zero occurrences in production code.** The event log knows when something happened and who did it, and never why.

**`runId` is a correlation key and is not a substitute.** `work_event`, `verdict` and `usage_event` each carry one, which groups the rows belonging to one run. It does not link two specific events, it does not cross into the streams that lack it — `claim_event`, `change_event`, `library_event` — and it does not survive the interesting cases, which are exactly the ones that span a run boundary.

**So cross-stream lineage is reconstructed by convention, which means by ordering.** A claim refusal in `claim_event`, the `work_event` of the session that re-routed because of it, the `verdict` that eventually landed, and the `usage_event` that paid for it are four rows in four tables joined today by a human squinting at `unit_id` and timestamps. Nothing records that the first caused the second.

**The house has already refused exactly this, in a neighbouring domain.** ADR-0235 clause 3 bans temporal proximity as proof of causation. ADR-0260 D3 requires that the offer's identity travel explicitly — *"If the id is not on the command line, there is no edge"* — and refused the trace-side "most recent set containing this node" resolution as candidate C in disguise. ADR-0260 D4 makes under-reporting the accepted failure mode and forbids inference from repairing it. That doctrine was written for context traversal and the event log never received it. **The result is that we forbid inferring causation from ordering in one domain while depending on it in another**, and the domain where we depend on it is the one carrying signed verdicts.

**This serves this arc's end state directly.** `verification-integrity-arc` requires that *"every observation the spine trusts carries enough identity that a missing observation is distinguishable from a stale one"*, and was chartered on the finding that its defects all share one property: they cannot go red, because a stale report and a healthy one look identical from outside. A causeless event log has that exact shape — an absent cause and an unrecorded cause are today the same silence.

**The arc has already decided this principle one layer down.** ADR-0249 found the oracle cross-check reading *"a file it had never established belonged to the observation it had just made"*, and settled that an unattributable observation is not evidence. That is this ADR's thesis applied to a single observation's identity; this one applies it to the link between two. The through-line is the same: a relationship the system depends on must be **recorded** by whoever knew it, never reconstructed afterwards by whoever needs it.

**The hazard this decision must survive is a field with no writer, and there are two measured instances.** ADR-0320 measured, over every recorded session on the dev box — 274 trace files, 909 candidate sets, **5048 offered ids** — precisely **ZERO** `followed_edge` events. The producer half had recorded for weeks while the answering half never fired outside tests, because the ask had never been made in any guidance artifact. Separately, `memory-provenance-stamp-has-no-writer` is parked on this very arc: ADR-0301 added `metadata.branch` and taught a ceiling to exclude on it, but nothing emits the stamp, so the exclusion never fires. A nullable `causedBy` that nothing populates would be the third instance, and it would be **worse than absent**, because null renders as *"nothing caused this"* rather than *"nobody recorded it"* — the arc's signature failure mode, reproduced by the fix.

## Decision

**An event that was caused by another event says so, at emission, or says nothing — and nothing downstream may fill the silence.**

1. **Causality is recorded as a qualified reference to an existing event, not a new identity.** An event may carry `causedBy: { stream, seq }` — the stream name and the `BIGSERIAL` primary key that every one of the eleven streams already has. Two nullable columns per stream (`caused_by_stream`, `caused_by_seq`) and the corresponding optional field on `StoreEvent`. Additive, no backfill, no foreign key (consistent with ADR-0017's rule that relationships are id references, never cross-table keys). Note that `StoreEvent.id` is the **document** id, not an event identity — `(stream, seq)` is the only addressable event identity that exists today, and D1 builds on it rather than minting a competitor.

2. **The emitter stamps it, or it is absent. It is never inferred.** No backfill pass, no correlation job, no "nearest preceding event in the same run", no join on `unit_id` plus adjacency. This is ADR-0235 clause 3 and ADR-0260 D4 applied verbatim to the event log rather than restated: **under-reporting is the accepted failure mode, and inference may never repair it.** A future proposal to correlate events into edges must supersede this clause and both of those.

3. **Absent means unrecorded, and every surface must say which.** A reader renders `caused by: <stream>#<seq>` or `caused by: not recorded` — never silence, and never a blank that reads as "nothing caused this". This is ADR-0312's move applied here: the blind spot is stated per-row rather than carried as a prose caveat, because the recorded share varies by stream and a single number could never carry it.

4. **The column lands only alongside a real producer and a real reader. No dormant field.** The increment that adds the schema must ship at least one complete (cause → effect) pair end to end, emitted by production code and rendered by a surface, proven by a test that fails when the stamp is dropped. Shipping the column alone is explicitly refused on the evidence in Context: two measured instances of exactly that, one of which sat at zero for weeks while looking built.

5. **The first pair is chosen by a criterion, not named here: it must be a join `runId` does not already make.** `work_event` → `verdict` → `usage_event` already share a `runId`, so an edge between them demonstrates the mechanism while proving nothing new. The valuable edges are the cross-stream ones with no correlation key at all — `claim_event` → `work_event`, `change_event` → `work_event`, `library_event` → the verdict its edit invalidated. Which of those goes first is the increment's call.

6. **`runId` stays, and is not replaced or reinterpreted.** Correlation and causation are different axes: `runId` groups the events of one run, `causedBy` links two specific events. Neither is derivable from the other and neither is deprecated by this decision.

7. **This is observability only. Nothing in the spine may branch on `causedBy`.** No behaviour reacts to it, no rollup reads it, no derived status or verdict moves with it. `rollupStatus` ignores the field entirely, exactly as it ignores `usage_event`. This holds the line ADR-0235 clause 7 and ADR-0260's "not in scope, deliberately" both hold — acting on the evidence is a separate decision — and it is also what keeps ActiveGraph's reactive half out (see below).

### What was weighed

**Candidate A — do nothing; keep reconstructing lineage from `unit_id` and timestamps.** Free, and it is the status quo. **Refused because it is the banned inference performed by hand.** ADR-0235 clause 3 rules out temporal proximity as evidence of causation; a human joining four tables on adjacency is applying precisely that rule-breaking heuristic, with no record that they did and no way for a later reader to check.

**Candidate B — mint a global event id (ULID/UUID) on every event and point at that.** Cleaner in the abstract, and the shape ActiveGraph uses. **Refused on sequencing, not on merit:** it requires a new column populated across every stream before a single edge can be drawn, which is a big-bang migration paying its whole cost before delivering any observability. `(stream, seq)` is available today at zero migration cost. If a future need genuinely requires an opaque portable event identity — export, or a store that is not Postgres — B is the natural successor and this clause is where it starts.

**Candidate C — a qualified `(stream, seq)` reference. CHOSEN.** Additive, backfill-free, and builds on identity that already exists. Its cost is that an event reference is only meaningful inside one store, which is acceptable while the shared Cloud SQL store is the only source of truth (ADR-0302 D1).

**Candidate D — adopt ActiveGraph as the runtime.** Refused on three independent grounds, recorded so the option is explicitly closed rather than quietly dropped. Its own paper resolves nothing about *"multi-agent contention over a shared graph"*, which is the subject of our entire claim ledger. Its design states there is *"no orchestrator threading state between steps"* — only reactive behaviours that sometimes chain — which contradicts ADR-0005's deterministic spine, and a population of behaviours that *sometimes* chain cannot make the ordered red→green observation ADR-0020 requires the spine to make before it signs. And its replay serves recorded side effects from cache, so a replayed verdict would be precisely the forged healthy that ADR-0020 and ADR-0060 already forbid (`--store pg` is refused for dry runs for this reason). The `caused_by` primitive is separable from all three, which is why this ADR takes it alone.

## Consequences

**Cross-stream lineage becomes traversable for the first time**, and the arc's end state moves closer: an observation that carries the event that caused it is one where a missing cause is distinguishable from an unrecorded one, which is the distinction the arc was chartered on.

**The real cost is not the column — it is that every emitter must know what caused it.** This is a behavioural ask on emitting code, the same class of dependency ADR-0260 introduced when trace completeness became a function of agent behaviour, and it is why D4 refuses to let the schema land ahead of a producer. Expect the recorded share to start near zero and rise one emitter at a time; D3 is what keeps that honest on the surface rather than flattering.

**A low fill rate is not by itself a defect, and ADR-0320 D7 governs what a flat number would mean.** An event genuinely caused by nothing recorded — a session's first claim, an owner-initiated edit — correctly carries no edge. The failure to watch for is the ADR-0320 shape: a producer that never fires at all, which is invisible in a percentage and obvious in a per-stream count of zero.

**Two ADRs now fence inference on the event log where one fenced it on the traversal.** ADR-0235 clause 3 and this D2 must both be superseded by any future proposal to derive edges by correlation. That redundancy is deliberate: the traversal fence did not reach this domain, which is how the domain carrying signed verdicts ended up the one without it.

**ADR-0006's `## Open` list shrinks by one clause and no more.** Wire protocol, OTel-GenAI-vs-bespoke vocabulary at large, and the channel-as-typed-event question are all untouched and remain open.

**Nothing about proof moves.** D7 keeps `causedBy` out of every derived status and every verdict, so this decision cannot make a unit look greener, redder, or differently attributed. It is a reader's affordance, and the moment something branches on it, that is a new decision.

## References

- ADR-0006 — event store & observability surface; amended here on the causality clause of its open event-vocabulary question.
- ADR-0017 — history is events, current is a projection; relationships are id references, never cross-table foreign keys.
- ADR-0235 — records context traversal at deterministic runtime boundaries; clause 3 bans temporal proximity as proof of causation, clause 7 holds observability before behaviour change.
- ADR-0260 — a followed edge needs an offer it can be joined to, and ordering cannot supply it; D3 (identity travels explicitly) and D4 (under-report, never infer) are the doctrine this ADR generalizes to the event log.
- ADR-0249 — an unattributable observation is not evidence; the same principle at the single-observation layer, on this same arc.
- ADR-0312 — the `doc:` blind spot is measured, not closed; the per-row honesty move D3 applies here.
- ADR-0320 — measured 5048 offered ids against zero `followed_edge` events; the dormant-producer evidence behind D4.
- ADR-0020 / ADR-0060 — spine-side red-green and the refusal to persist a scripted pass; why candidate D's replay is incompatible with our proof model.
- ADR-0005 — the deterministic orchestrator spine that candidate D's behaviour population would replace.
- `packages/library/src/store/schema.sql` — the eleven append-only streams D1 adds two columns to, enumerated explicitly rather than looped from the catalog so a new stream cannot silently acquire causal columns it has no emitter for.
- `packages/storage-protocol/src/store.ts` — `StoreEvent`, and the `Store` seam that gains the optional field.
- Arc `verification-integrity-arc` — the initiative this ADR is filed under; its parked `memory-provenance-stamp-has-no-writer` is the second dormant-field instance cited in Context.
