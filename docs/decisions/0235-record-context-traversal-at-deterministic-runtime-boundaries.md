---
status: accepted
decided: 2026-07-24
arc: linked-session-context-arc
---
# ADR-0235: Record context traversal at deterministic runtime boundaries

## Status

accepted (2026-07-24) — decided/directed by the owner in conversation on 2026-07-24. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

Session onboarding and long-running work feel progressively slower, but today we cannot distinguish useful context accumulation from broad searches, repeated reads, unproductive branches, idle time, or child-agent work. Raw transcripts expose temporal order and tool calls, but not enough deterministic causality to reconstruct which Library choices were offered, followed, revisited, or merely inspected at the front-matter level.

Asking the model to document its own traversal would consume the very context and effort we want to understand, and model-authored compaction is not a trustworthy source of truth. Arbitrary traversal or context limits would also remove useful escape hatches before we have evidence about where the actual waste occurs.

The Library is already a canonical context DAG (ADR-0161), and ceremony bodies are served just in time (ADR-0156). We need an observational visit layer over that DAG: canonical nodes describe what may be traversed, while immutable visit events describe what each runtime actually did.

## Decision

1. **Runtime adapters record traversal ambiently.** The CLI/runtime boundary emits metadata events for search, candidate presentation, front-matter inspection, full payload reads, revisits, context addition, agent spawn, parent-to-child handoff, child return, and session completion. The model performs no telemetry bookkeeping.

2. **Canonical identity and chronological identity remain separate.** A context event records a stable `nodeId` for the Library artifact and a unique `visitId` for that occurrence. When causality is known, it also records `parentVisitId`, `surfaceId`, offered candidate identities, and followed-edge identities. A revisit therefore remains a new chronological visit linked to an earlier visit rather than a backward jump in the playback.

3. **The schema distinguishes observation strength.** Metadata-only/front-matter reads and full-payload reads are different event kinds. Causal knowledge forks are rendered only when deterministic candidate/followed-edge metadata exists; temporal proximity is not treated as proof. Spawn and return edges may be shown independently because those boundaries are already observable.

4. **Context gauges use runtime-declared capacity.** Each model request may record cumulative input tokens, tokens added since the previous observation, and the actual context-window capacity declared by that runtime/model. The owner-selected 500k threshold is initially displayed as a red danger region for interpretation; it is not a cutoff, eviction trigger, or claim that every model has a one-million-token window.

5. **Parent and child sessions are independent traces joined by handoffs.** A spawned agent has its own session identity, agent type, context window, and inner loop. The parent records the payload handoff and result return so the forest projection can link lanes without merging their token counts.

6. **Telemetry is metadata-only and honest about coverage.** It must not duplicate context bodies, prompts, tool results, hidden reasoning, credentials, or other content into the traversal store. Each adapter publishes which event kinds and fields it can observe; missing causal metadata remains visibly unknown rather than inferred.

7. **Observability lands before behavior change.** The rollout starts with strict capture and replay at one deterministic runtime boundary, then expands across terminal, desktop-chat, and spawned-agent paths with each adapter's actual coverage kept explicit. Ranking, prefetch, guidance, pruning, compaction, eviction, and traversal limits require later evidence-backed increments and, where they remove options or context, a separate owner decision.

## Consequences

- Long sessions can be measured by depth, width, repeated visits, payload growth, latency, idle time, and parent/child handoffs without asking the model to narrate its work.
- The UI can project a chronological visit tree over the canonical Library DAG while preserving the difference between a node and repeated visits to it.
- Existing transcript-derived traces remain useful but incomplete: they can show timing, tool activity, token observations, and agent handoffs, while knowledge forks remain absent until deterministic event metadata exists.
- Every runtime integration must define event coverage and stable identifiers. This adds adapter and schema work before optimization work can begin.
- Metadata minimization reduces privacy and storage risk, but query paths still need normal access control, retention, and schema-version handling.
- The 500k danger region provides a common visual cue without constraining execution. Its predictive value must be tested against observed outcomes rather than treated as a universal model boundary.
- No session self-compaction, arbitrary context cutoff, or silent idle-time removal is authorized by this decision.
- **Clause 1's "ambiently" is qualified by one adapter, recorded 2026-07-27.** The host-transcript boundary (`surface:host_transcript`, built under ADR-0248 D1) READS a surface the host harness writes rather than emitting at a runtime boundary of ours, because that harness has not flushed the current request while our process is running — an ambient hook at dispatch would observe a file missing exactly the request that triggered it. It is therefore an explicit, idempotent `storytree traversal ingest <session>` instead. Clause 1's substance is untouched: the model still performs no telemetry bookkeeping, because the transcript is machine-written and nothing is self-reported. The reasoning lives at `packages/cli/src/traversal.ts`. This adapter also satisfies clause 6 in its own envelope rather than through the shared replay renderer, which does not yet know it — an honest partial, not a missing declaration.
- **Clause 4's "red danger REGION" is narrowed to a form, recorded 2026-07-27.** The owner's revision of the visual contract that day retired the per-node gauge in favour of one playhead bar, which leaves no ring for a region to sit on. The threshold is now drawn as nothing at all: the over-threshold PORTION OF THE FILL renders red, and no marker, tick, or danger arc is drawn for the threshold itself — when the fill has not reached it, there is nothing red on screen. Clause 4's substance is untouched: the owner-selected 500k figure remains a display-only interpretive cue, and is still not a cutoff, an eviction trigger, or a claim that every model has a one-million-token window. The rule is governed by ADR-0248 and carried as an explicit anti-goal in `docs/design/context-traversal/README.md` ("no threshold marker drawn on any ring or bar"); this bullet exists because clause 4 read alone would have an implementer draw the retired region. Both canonical reference artifacts were regenerated against the revision on 2026-07-27 and conform.
- **Clause 6's coverage declaration gained a second channel — free-text CAVEATS — recorded 2026-07-28.** Clause 6 requires each adapter to publish what it can and cannot observe, and until now the whole declaration was a closed `CoverageFeature` enum split into `supported` / `omitted`. That enum can say *which* features an adapter observes; it cannot say **why a supported one gives a thin picture**, and ADR-0260 D7 needed exactly that: `event:candidate_set` is genuinely supported, yet a `doc:` ref is offered but its follow is unobservable, and follow-completeness depends on the agent re-using the offered command form. Neither gap is expressible as an omitted feature, and ADR-0260 D4 forbids ever repairing them by inference — so stating them is the only mitigation available. `CoverageCaveat` / `renderCoverageCaveats` (`packages/context-traversal-capture/src/offer-candidate-sets.ts`) carry them, rendered as a `coverage-caveats:` block beside the supported/omitted lists in the same envelope. Clause 6's substance is untouched and in fact better served: this bullet exists because clause 6 read alone would have an implementer treat the enum as the whole declaration and quietly drop a gap it has no slot for. One thing is deliberately NOT decided here: the caveat type currently lives in the capture package rather than beside `CoverageFeature` in the telemetry package, so the second adapter to need caveats must either reach across or hoist it — a placement to settle when there is a second consumer, not before.

## References

- [ADR-0011: Own the agent loop and context engineering](0011-own-the-agent-loop-and-context-engineering.md)
- [ADR-0156: Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md)
- [ADR-0161: The library is a node-keyed context DAG](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md)
- [ADR-0203: Per-slice token-usage capture and the token-analytics surface](0203-per-slice-token-usage-capture-and-the-token-analytics-surfac.md)
- [Context traversal visual contract](../design/context-traversal/README.md)
- Arc: `linked-session-context-arc`
