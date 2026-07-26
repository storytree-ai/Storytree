---
status: proposed
arc: linked-session-context-arc
---
# ADR-0248: A context gauge needs window occupancy, which cumulativeInputTokens is not

## Status

proposed — surfaced on 2026-07-26 by the `session-orchestrator` while landing increment 4 of
`linked-session-context-arc`, the increment that made a runtime-declared context-window capacity
reach the trace for the first time. The owner has not directed an answer. The fork is about what
the arc's signature visual MEANS, which ADR-0235 supplies the vocabulary for but does not settle,
so this is born `proposed` and escalates rather than deciding.

It re-opens nothing. ADR-0235 governs WHAT is observed and its clause 4 governs capacity; ADR-0241
governs WHERE it is stored. Neither says what quantity a gauge plots against that capacity.

## Context

The arc's end state asks for a per-visit circular gauge: *"the inner arc shows cumulative context
used, its terminal thickness shows context added by that visit, and the remainder shows capacity
left"*, with an owner-selected 500k threshold marked in red.

Two of those three quantities now exist in a real trace. Increment 4 carried the SDK's declared
`ModelUsage.contextWindow` through to the bytes, so `contextWindowCapacity` is populated for the
first time. `cumulativeInputTokens` has been populated since increment 3.

**Plotting one against the other does not produce an occupancy gauge.** Measured on this
increment's own two `--real` builds — the trace files are the evidence, not an estimate:

| slice | turns | in | cache-read | cache-write | `cumulativeInputTokens` | `contextWindowCapacity` | ratio |
|---|---|---|---|---|---|---|---|
| `AUTHOR_TEST` | 22 | 325 | 1,128,565 | 96,840 | 1,225,730 | 200,000 | **613%** |
| `IMPLEMENT` | 17 | 327 | 941,911 | 66,233 | 1,008,471 | 200,000 | **504%** |

The two numbers are different KINDS of quantity:

- `contextWindowCapacity` is the size of the window for ONE request.
- `cumulativeInputTokens` is the sum of the three input axes over the WHOLE slice — every turn. It
  is dominated by `cacheReadInputTokens`, which re-counts the resident context on every turn: a
  22-turn slice against a 200k window reads roughly 22 × 51k cached tokens. That is a BILLING total
  (tokens processed — the axis `events.usage_event` exists to record), not an OCCUPANCY figure
  (tokens resident in the window).

So a gauge built from today's two fields would read six times full, and its "capacity left"
remainder would be negative. This is not a rendering bug to fix in the UI layer: the occupancy
quantity the end state describes **is not observed at any boundary today**.

Two further facts bound the options:

1. **The SDK result aggregates.** `usageFromSdkResult` reads one result message per slice; the
   per-turn breakdown that would yield "input tokens on the final request" is not in it. Occupancy
   is not derivable from what the build spawn boundary observes today.
2. **Host transcripts do carry per-request usage.** `~/.claude/projects/**.jsonl` records
   `message.usage.*` per assistant message, so a per-request input total is recoverable there — but
   that is a different surface with no adapter, and reading it is a new boundary, not a field
   addition. It carries no capacity field of its own, so capacity would still come from the runtime
   declaration increment 4 landed.

The naming matters because the field is already load-bearing. `cumulativeInputTokens` reads like
occupancy, and increment 1's vocabulary pairs it with `addedInputTokens` in a way that invites the
occupancy reading. The measurement above is the first time the two have been observed together on
real bytes, and it is what makes the gap visible.

## Decision

Deferred to the owner. Four candidates, stated so the trade is visible:

- **A — observe occupancy at the boundary that has it.** Add a per-turn observation so a slice's
  final-request input total is recorded, and plot THAT against capacity. *Cost:* the build spawn
  boundary cannot supply it from the SDK result, so this means observing the SDK's message STREAM
  rather than its result — a materially larger adapter and a new ADR-0235 boundary.
- **B — keep `cumulativeInputTokens` as billing and add a separate, explicitly-named occupancy
  field**, absent wherever it is not observed exactly as capacity is. *Cost:* two similar-looking
  token fields in one event, with a standing risk that a later reader plots the wrong one — the
  precise confusion this ADR exists to name.
- **C — change what the gauge plots.** Render throughput/turnover against the window — a ratio that
  legitimately exceeds 1 — and drop "capacity left" from the end state. *Cost:* a real retreat from
  the arc's stated end state, and the 500k threshold loses the meaning the owner selected it for.
- **D — source occupancy from the host transcript surface.** Build the transcript adapter and take
  per-request usage from there. *Cost:* a new surface with its own identity-correlation problem
  (transcript session ids are not storytree session ids), and it observes the ORCHESTRATOR's window
  rather than the build leaf's.

Until this is settled, increment 4 ships the capacity field and **no gauge**. The 500k display
marker stays out of scope for the same reason: a threshold drawn on a scale whose meaning is
unsettled would encode the confusion rather than reveal it.

## Consequences

- Increment 4 lands `contextWindowCapacity` populated from a real runtime declaration, with no gauge
  and no threshold marker. That is a smaller increment than "the gauge is unblocked" would suggest,
  and the increment log says so plainly.
- The arc's signature visual stays blocked on this fork — not on capacity, which is now solved.
  Anyone reading "capacity now flows" as "the gauge can be built" will build a gauge reading 613%.
- Whichever option is taken, `cumulativeInputTokens` should be documented at its definition site as
  a billing total rather than an occupancy figure, because it currently reads as the latter.
- Options A and D both add a boundary, so both inherit ADR-0243's unsettled question about how an
  adapter earns its activation leg.

## References

- ADR-0235 — record context traversal at deterministic runtime boundaries (capacity is clause 4).
- ADR-0241 — context traversal traces persist locally per session.
- ADR-0243 — how a live-spend-only adapter earns an activation leg (proposed; A and D inherit it).
- ADR-0203 — the per-slice usage stream, where the billing axes already live.
- `packages/context-traversal-spawn/src/observe-leaf-slices.ts` — where `cumulativeInputTokens` is
  computed as the sum of the three input axes.
- `packages/agent/src/sdk-author.ts` — `usageFromSdkResult`, which reads one aggregate result per
  slice (fact 1 above).
- `asset:linked-session-context-arc` — the end state describing the gauge.
