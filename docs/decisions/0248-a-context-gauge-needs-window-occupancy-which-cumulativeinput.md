---
status: accepted
decided: 2026-07-27
arc: linked-session-context-arc
---
# ADR-0248: A context gauge needs window occupancy, which cumulativeInputTokens is not

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Surfaced 2026-07-26 by the `session-orchestrator` while landing increment 4 of
`linked-session-context-arc`, the increment that made a runtime-declared context-window capacity reach
the trace for the first time. Born `proposed` because the fork was about what the arc's signature
visual MEANS, which ADR-0235 supplies the vocabulary for but does not settle.

It re-opens nothing. ADR-0235 governs WHAT is observed and its clause 4 governs capacity; ADR-0241
governs WHERE it is stored. Neither says what quantity a gauge plots against that capacity.

Two reviews reached this body while it was still `proposed`, and one of them changed the shape of the
fork:

1. Increment 4's pre-merge `librarian-curator` pass (2026-07-26) corrected the quantity count in
   Context (one of the three exists, not two) and added the measured fact that `addedInputTokens`
   duplicates `cumulativeInputTokens` at this boundary.
2. The **owner-approved visual contract** (`docs/design/context-traversal`, landed in #937 and now
   referenced from ADR-0235) was published after this ADR was written. It eliminated one candidate
   outright and moved another from untried to half-proven — see Context. The owner then revised the
   contract itself in conversation on 2026-07-27, retiring the per-node gauge in favour of a single
   playhead bar, which removed one of the three quantities from the problem entirely.

## Context

The arc's end state asked for a per-visit circular gauge: *"the inner arc shows cumulative context
used, its terminal thickness shows context added by that visit, and the remainder shows capacity
left"*, with an owner-selected 500k threshold marked in red.

Exactly ONE of those three quantities exists in a real trace. Increment 4 carried the SDK's declared
`ModelUsage.contextWindow` through to the bytes, so `contextWindowCapacity` is populated — that one is
genuine, and it is the capacity the gauge is drawn against. Two token FIELDS are also populated
(`cumulativeInputTokens` since increment 3, and `addedInputTokens` alongside it), but neither carries
the quantity its name promises.

**Plotting one against the other does not produce an occupancy gauge.** Measured on increment 4's own
two `--real` builds — the trace files are the evidence, not an estimate:

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

**`addedInputTokens` is not a third quantity either — at this boundary it is the same number.**
`observe-leaf-slices.ts` emits `cumulativeInputTokens: totalInputTokens` and
`addedInputTokens: totalInputTokens` from one variable, so both fields carry the identical
whole-slice billing total. The gauge's "context added by that visit" is therefore not observed
either; the field that names it is a duplicate of the one beside it.

### What the approved visual contract settles

The visual contract carries a committed reference trace, shaped from metadata extracted from recorded
session `02b6a304-6b29-41d0-9276-b9ce7b8958e3`. Its `parent` series is the decisive evidence, because
**it recedes**: 240.9k → 228.1k, and again 239.8k → 229.6k, with the per-visit `added` value falling
to 0 on exactly those visits.

That is a stronger disqualifier than the 613% ratio. A billing total is monotonic by construction — it
can only ever rise. The approved picture requires a quantity that can fall. **No existing field can
draw it, and no re-scaling of an existing field can either.**

The same trace half-proves a source. Its series was extracted from a host transcript, which is
candidate D's surface; that surface demonstrably yields a quantity of the right kind and shape. What it
cannot see is a build leaf's own window.

Two further facts bound the options:

1. **The SDK result aggregates.** `usageFromSdkResult` reads one result message per slice; the
   per-turn breakdown that would yield "input tokens on the final request" is not in it. Occupancy
   is not derivable from what the build spawn boundary observes today.
2. **Host transcripts do carry per-request usage.** `~/.claude/projects/**.jsonl` records
   `message.usage.*` per assistant message, so a per-request input total is recoverable there. It
   carries no capacity field of its own, so capacity would still come from the runtime declaration
   increment 4 landed.

### A correction to this ADR's own earlier reasoning

While this ADR was `proposed`, an argument was raised in conversation that candidate C was the only
option preserving the owner's 500k threshold, on the ground that a 500k marker is off-scale against a
declared 200,000 window. **That argument was wrong and is recorded here so it is not re-made.** It
generalised from the build leaf's 200k window to every window. The approved reference trace runs
against a 1M window, where 240.9k occupancy and a 500k marker coexist without difficulty. The
threshold is a property of the window being observed, not an argument about which quantity to plot.

## Decision

**Occupancy is sourced from the host transcript surface — the orchestrator's own window. The
SDK-message-stream option for build-leaf windows is deferred to a later increment of this arc.**

The owner's direction on 2026-07-27 was that **orchestrator observability takes priority**: the window
that matters first is the one the session owner is actually sitting in, and that is the window the
transcript surface exposes and the approved reference trace already demonstrates.

Concretely:

1. **Build the transcript adapter** (ADR-0235 clause 1, a new boundary) and take per-request input
   totals from it as the occupancy quantity. Capacity continues to come from the runtime declaration
   increment 4 landed. Its identity-correlation problem — transcript session ids are not storytree
   session ids — is the substance of that increment's work, not a reason to prefer another source.
2. **`cumulativeInputTokens` is documented at its definition site as a billing total**, not an
   occupancy figure, because it currently reads as the latter.
3. **`addedInputTokens` is DELETED, not de-duplicated.** The owner's revised visual contract replaces
   the per-node gauge with a single bar that fills as the playback runs, and a bar needs ONE quantity.
   "Context added by this visit" is no longer a thing that must be drawn, so the field that names it is
   removed rather than given a real per-visit delta. This also disposes of the cost recorded against
   candidate B below: the event does not end up carrying three token fields.
4. **The SDK-message-stream option (candidate A) is deferred, not refused.** A build leaf's own window
   is a real thing to want; it is simply not the priority, and nothing in this decision blocks it. It
   remains available as a later increment, and it does not have to displace the transcript source when
   it lands — one boundary per window is the natural end state.

The candidates as they were stated, and their disposition:

- **A — observe occupancy at the SDK message stream.** DEFERRED to a later increment. Materially
  larger adapter and a new ADR-0235 boundary; sees the build leaf's own window, which the transcript
  surface cannot.
- **B — keep `cumulativeInputTokens` as billing and add a separately-named occupancy field.** TAKEN in
  part, as the naming half of this decision. B was never a source — it names a field without filling
  it — so it is not sufficient on its own. Its recorded cost is void: see D3.
- **C — change what the gauge plots to throughput/turnover.** REFUSED. Turnover has no outer window,
  no remainder, and nowhere for the 500k region to live, so it contradicts the approved visual
  contract directly. It was also never necessary: it was reached for as an escape from the 613%
  reading, and the receding-series evidence shows the real requirement is a quantity that can fall,
  which turnover does not supply either.
- **D — source occupancy from the host transcript surface.** TAKEN.

**Neither A nor D inherits ADR-0243.** The claim in this ADR's original Consequences that both do was
wrong, and is corrected here. ADR-0243's difficulty is specific to a boundary that only fires when a
real build spawns a subscription-funded leaf and therefore cannot be exercised where CI runs. Reading a
local transcript file is free and needs no credentials — the same shape as increment 2's terminal CLI
dispatch boundary, which earned five signed machine UAT legs by spawning the real CLI and asserting on
bytes on disk. The transcript adapter's activation is expected to be machine-provable the honest way;
that expectation is the planning increment's to confirm, not this ADR's to assume.

## Consequences

- Increment 4 landed `contextWindowCapacity` populated from a real runtime declaration, with no gauge
  and no threshold marker. That was a smaller increment than "the gauge is unblocked" would suggest,
  and the increment log says so plainly.
- The arc's signature visual is unblocked by this decision plus the revised visual contract, but not
  yet built: the transcript adapter is the next observability increment after the floor rebuild.
- `addedInputTokens` is to leave the vocabulary (not yet done — see the execution-status bullet
  below). That is a narrowing of an ADR-0235 clause-4 field and is
  recorded here rather than by amending 0235, because 0235 says a request *may* record tokens added —
  permissive, not mandatory — so removing the field contradicts nothing in it.
- **Execution status of D2 and D3, recorded 2026-07-27 — neither is done, and the floor rebuild
  deliberately did not do D3.** The `context-traversal-telemetry` floor rebuild (the increment that
  re-proved the event vocabulary red→green after it was found holding zero signed verdicts) KEPT
  `addedInputTokens` on `ModelContextEvent`. The field has live emitters in
  `packages/context-traversal-spawn` — a different story — and dropping a key from a `.strict()`
  shape that another package writes into belongs to the increment that owns those emitters, not to
  the floor. The reasoning is recorded at the definition site in
  `stories/context-traversal-telemetry/traversal-event-vocabulary.md`. **Read that re-green as D3
  PENDING, not as D3 contradicted.** D2 is also unexecuted: as of this date no definition site
  documents `cumulativeInputTokens` as a billing total — not the schema in
  `packages/context-traversal-telemetry/src/traversal-events.ts`, not the emitter in
  `observe-leaf-slices.ts`, and not either story spec. That is an open gap rather than a deliberate
  deferral, and it leaves the misreading trap below still open.
- Anyone reading "capacity now flows" as "the gauge can be built" would have built a gauge reading
  613%. D2's documentation requirement is what closes that trap — and until D2 actually lands
  (previous bullet) the trap stays open, guarded by this ADR alone rather than by the code.
- The 500k region survives as a display-only rule on the bar: the portion of the fill beyond the
  threshold renders red, with no marker drawn. It is not a cutoff, an eviction trigger, or a claim
  about any model's window size.

## References

- ADR-0235 — record context traversal at deterministic runtime boundaries (capacity is clause 4).
- ADR-0241 — context traversal traces persist locally per session.
- ADR-0243 — how a live-spend-only adapter earns an activation leg (neither A nor D inherits it; see
  Decision).
- ADR-0203 — the per-slice usage stream, where the billing axes already live.
- [Context traversal visual contract](../design/context-traversal/README.md) — the owner-approved
  composition; its reference trace is the receding-series evidence, and its 2026-07-27 revision is
  what deletes `addedInputTokens`.
- `packages/context-traversal-spawn/src/observe-leaf-slices.ts` — where `cumulativeInputTokens` is
  computed as the sum of the three input axes, and where both token fields are emitted from one
  variable.
- `packages/agent/src/sdk-author.ts` — `usageFromSdkResult`, which reads one aggregate result per
  slice (fact 1 above).
- `asset:linked-session-context-arc` — the end state describing the gauge.
