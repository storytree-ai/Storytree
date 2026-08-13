---
status: accepted
decided: 2026-08-13
amends: [235, 260, 320]
arc: adr-0320-d7-fill-rate-falsification-arc
---
# ADR-0360: Instrumentation needs a consumer before it needs fidelity: the context decision tree stops at observation

## Status

accepted (2026-08-13) — decided/directed by the owner in conversation on 2026-08-13. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0320 D7 pre-committed a falsification: *"If the fill rate stays near zero after the guidance lands, that is a FINDING, not a retry … it reopens ADR-0260's candidate A (within-process offers only) as the honest ceiling of this telemetry."*

**The condition has fired.** Measured over `~/.storytree/traces`, restricted to events after the ADR-0320 merge commit `503d1149` (2026-08-06T12:39:58Z):

| when | sessions | candidate sets | offered ids | followed edges | fill rate |
|---|---|---|---|---|---|
| baseline 2026-08-06 (pre-change) | 112 files | 909 | 5048 | **0** | 0% |
| interim 2026-08-09 | 43 | 416 | 2592 | **1** | ~0.04% |
| 2026-08-13 | **61** | **539** | **3190** | **1** | **0.031%** |

The single edge is the one the measuring session produced on 2026-08-06. In the seven days and 61 independent sessions since, the count has not moved. That is past this arc's own "dozens of independent sessions at minimum" bar, and D7 forecloses re-running it: a still-flat number is a finding, not a retry.

Answering D7 as written would mean weighing candidate A against candidate B. Three facts surfaced while doing that, and together they move the decision to a different altitude than D7 anticipated.

### 1. The capture is structurally blind to the pathway agents mostly use

Every recorded event carries a `surfaceId`, and across all 7,212 events on this machine there are exactly four — `library-artifact` (4,226), `agents` (908), `tree` (207), `library-dashboard` (28). All four are `storytree` CLI surfaces. All 630 `search` events are `library_artifact_list`, the CLI's own list verb.

There is **no** adapter for file-level navigation. `observeCliInvocation` is an allowlist over argv and says so in its own header — *"the default answer for any invocation is zero events"* — and `.claude/settings.json` registers only `SessionStart` and `UserPromptSubmit` hooks, so nothing observes a `Grep`, `Read`, or `Glob`. An agent that greps its way to an artifact and reads the file produces no visit at all.

This is the same hole ADR-0312 measured from the other side: 36.7% of the corpus's 1,500 refs are `doc:` file pointers, unobservable precisely *because* files are read by tools that emit nothing.

The consequence for the number above: **0.031% is a rate whose denominator excludes most of the traffic.** It cannot currently distinguish "agents ignore the offered form" from "agents rarely encounter an offer at all", so D7's stated conclusion — that the behavioural ask does not survive contact with real sessions — is under-determined by its own instrument.

### 2. Candidate A already ships, and does not port to the surface that needs it

Candidate A is not hypothetical. `descend-agent-refs.ts` implements it for the `agents` surface: `storytree agents <name>` resolves the agent's floor refs and emits a child `front_matter_read` per resolved ref carrying `parentVisitId` explicitly — never a correlation. It accounts for **632 of 3,221 visit events (19.6%)**, and all 632 are on that one surface; `library-artifact` has zero.

632 edges against candidate B's 1 looks decisive until you ask what a library-artifact version would record. It would be **information-free**:

- The Sources block is built as `groupSources(a.references, …)`, and the resolver returns only `{kind, title}` — bodies never enter context. Compare `renderAgentEssentials`, which renders each floor ref's assertion inline, so agent-surface descent reflects content that genuinely entered a context.
- **The offer set for artifact X is exactly X's `references` field.** This is not inference: increment 7 (#1172) verified it against an oracle independent of the traversal, over 1,125 artifacts — *membership agrees, zero divergences corpus-wide*; only ordering differs (ADR-0318).

So per-session descent on this surface would re-stamp, once per read, a fact already statically true of the corpus — a graph `storytree library tree focus <id>` already renders with no telemetry at all. ADR-0260 refused candidate A because it *"draws the containment tree we already have, with better labels"*; on this surface it is weaker still, drawing the static reference graph.

### 3. The question the whole line was built to answer has been answered elsewhere

ADR-0235's Context states the purpose: *"Session onboarding and long-running work feel progressively slower, but today we cannot distinguish useful context accumulation from broad searches, repeated reads, unproductive branches, idle time, or child-agent work."* Clause 7 then fences every use — ranking, prefetch, guidance, pruning, compaction, eviction, traversal limits — behind later evidence-backed increments and a separate owner decision.

`session-cost-arc` (closed) answered that question by pricing ten sessions' transcripts directly, using no traversal events: **input-side rent is 89% of spend** (67% cache read, 22% cache write, 12% output), and the ~85k fixed preamble re-read every turn is **24% of the bill**. The librarian ceremony — the first suspect — was 8.7%.

The driver is what a session **carries**, not which branches it **walks**. ADR-0235 hypothesised the waste was in variable traversal; it is in fixed carry. None of clause 7's downstream consumers was ever commissioned, and the evidence that would have justified them now points elsewhere.

## Decision

1. **The D7 finding is recorded at the altitude above the fill rate.** The finding is not "the behavioural ask did not land." It is: **the decision-tree half of this telemetry has no commissioned consumer, and the question it was built to serve was answered by cheaper means.** D7 asked which capture mechanism is the honest ceiling; the prior question — what consumes this — had never been asked, and it dissolves the mechanism choice.

2. **Candidate A is REFUSED for the `library-artifact` surface, on a new ground, and this closes D7's reopening.** ADR-0320 D7's expectation that a flat rate reopens candidate A is **discharged, not deferred**. The refusal is no longer only ADR-0260's ("records descent, not choice") but the stronger measured one: the offer set is provably identical to the artifact's `references` (#1172), so the descent would record nothing the corpus does not already state. Do not revisit this as an optimisation; reversing it requires superseding this decision and re-deriving the equivalence.

3. **The `agents`-surface descent (`descend-agent-refs`) is untouched and stays.** It is not the same thing wearing a different name: it reflects a specific rendered view and resolves assertions into context. Nothing here argues against it, and its 632 edges are the only real depth any trace carries.

4. **The candidate-set / denominator half is KEPT.** `candidate_set`, the observability share (`offered N, observable M of N`), the named per-entry unobservable reasons, and the independent oracle all stand. They are what stop any drawn tree over-reporting, they are built and signed, and their marginal upkeep is ~0.

5. **The `followed_edge` half is kept but frozen.** No further work is commissioned on raising the fill rate: no gate, no compliance check, no widened predicate, no new surface for the ask. ADR-0320 D2's refusal stands and is now permanent rather than provisional — a check would buy compliance rather than signal and would manufacture the false edges ADR-0260 D4 exists to prevent. The mechanism is left in place because it costs nothing to carry and because the plausible route to a non-zero rate is a HARNESS change (something that pastes the offered form on the agent's behalf), which is cheap to attempt later only while the mechanism exists.

6. **Any surface reporting a follow rate must state the pathway it observes.** A rate rendered to a human without its coverage caveat overstates itself: the denominator is CLI reads only, and file reads are not observed at all. The traversal panel and the CLI replay say so plainly. This is the one build item this decision authorises, and it is a wording fix, not an initiative.

7. **Joining an offer to a later file-read remains forbidden.** Should a file-read adapter ever be built, it may record visits and improve the denominator; it may **not** be used to attribute a followed edge, because connecting "the CLI offered X at T" to "the agent read file X at T+n" is proximity inference — candidate C, fenced by ADR-0235 clause 3 and ADR-0260 D3, and unchanged here.

8. **The generalisation, which is why this is an ADR and not a note:** *commission the consumer before investing in the fidelity of an instrument.* ADR-0235 clause 7 deliberately deferred every use of this data, which was right at the time; what went unnoticed is that the deferral was never revisited, so four increments of fidelity work (the offer id, the denominator, the oracle, the guidance ask) were spent on a signal nothing had been committed to read. Future observability work names its consumer, or is explicitly built on spec with that stated.

## Consequences

**The A/B/C fork is closed, and no code is written to settle it.** The open question `oq-adopt-candidate-a-or-keep-the-empty-honest-tree` is answered by this ADR and retired against it.

**The arc closes having met its end state honestly.** `context-decision-tree-arc`'s end state — decision points drawn, ambiguous joins honestly marked, verified against an independent oracle — was met at #1172 and the arc closed 2026-08-12. This ADR settles the one clause that outlived it.

**We keep an instrument that is honest and nearly empty, and we say so.** The panel will draw a single column for `library-artifact` traces and state that it is one. That is a true report, and D6's whole point was that a stated baseline beats an assumed one — the same standard applies to a stated emptiness.

**The cost already spent is not recovered, and that is the finding's real content.** Four increments of fidelity work were correct in themselves — each shipped signed and green, and #1172's equivalence proof is precisely what makes decision 2 provable rather than aesthetic. What was missing was the prior question. Recording that is worth more than the arc it came from.

**A risk accepted knowingly.** Freezing the follow half means that if agent navigation behaviour changes — a harness that pastes offered forms, a model that follows printed commands faithfully — the rate could rise and nobody is watching for it. This is accepted: the mechanism keeps recording, so the evidence would accumulate on its own and any later session can measure it with the pinned baselines above. What is refused is *spending to make it rise*.

**What this does NOT decide.** Whether to build a file-read adapter for the grep pathway. It would answer a genuinely open question — what fraction of corpus navigation the offer surface can even see — and clause 7's line still holds: it is observation, not behaviour change. It is not commissioned here, and under decision 8 it would need its consumer named first.

## References

- ADR-0235 — the founding decision; its Context states the purpose this ADR reports back on, and clause 7 is the deferral that was never revisited. Clause 3's ban on ordering/proximity as evidence is untouched.
- ADR-0260 — the four-candidate fork. D4's wrong-never/missing-sometimes asymmetry stands; D7's coverage declaration is what this measures against. Candidate A's refusal is extended, not reversed.
- ADR-0312 — the `doc:` blind spot measured, not closed. Its D2 is the precedent for refusing a fix that would make a surface less honest, applied here to candidate A.
- ADR-0318 — offer-set order is pinned, not repaired; its membership-agrees finding (#1172) is the evidence behind decision 2.
- ADR-0320 — the decision this discharges. Its D2 (no gate) is made permanent; its D7 reopening of candidate A is closed.
- ADR-0330 / `session-cost-arc` — where ADR-0235's founding question was actually answered: 89% input-side rent, the ~85k preamble at 24% of spend.
- `packages/context-traversal-capture/src/observe-cli.ts` — the argv allowlist; `descend-agent-refs.ts` — candidate A as it actually ships.
- `packages/cli/src/commands.ts` `viewArtifact` — `groupSources(a.references, …)`, the resolver that returns `{kind, title}` only.
- `apps/studio/src/components/TraversalSpine.tsx` — the panel that must carry decision 6's caveat.
- `~/.storytree/traces` — the trace corpus the measurements above are taken over.
