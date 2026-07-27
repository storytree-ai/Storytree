# Context traversal visual contract

Status: owner-approved design reference for arc `linked-session-context-arc`.

Revised 2026-07-27 by owner direction in conversation: the per-node gauge is retired in favour of a
single playhead bar, nodes become plain marks, and revisit loop-back lines are dropped. See
[Revision 2026-07-27](#revision-2026-07-27) for what changed. Both reference artifacts below were
regenerated against that revision on 2026-07-27 and now conform.

## Canonical references

- [Playable narrow-panel mock](session-traversal-playback.html) — normative composition and interaction reference.
- [Static reference image](session-traversal-playback.png) — review fallback and visual-regression anchor.

The HTML reference is authoritative when the two differ — with no exception outstanding. The image
captures the full-trace state at a narrow story-details-panel width.

**The red is not visible in either artifact, and that is honest rather than missing.** The recorded
reference trace peaks at 240.9k, so its fill never reaches the 500k threshold and never turns red.
The rule is shown in the legend as an example fill, which marks nothing on the bar itself; it was
also exercised directly against the live render (forcing a 720k reading through the same path puts a
red segment starting at the threshold and nowhere else). A future artifact drawn from a trace that
does cross 500k should show the red on the bar and drop the legend example.

## Product composition

This is **not a dashboard**.

The traversal opens from the existing forest:

1. The owner selects a story-node island.
2. The story's narrow right-hand details panel shows a dropdown of active sessions that claimed it.
3. Selecting a session renders the traversal playback in that panel.
4. A footprint can be selected or double-clicked to drill into detail; the overview remains primarily pictorial.

The chronological traversal is the dominant picture. It is an **animation that is played and replayed** —
that is the primary way the shape is read, not a static diagram that happens to move.

## Visual grammar

- The traversal progresses through time on a compact vertical spine. Confirmed idle spans are folded explicitly rather than removed or visually stretched.
- **Context visits are plain node marks, not gauges.** They carry identity, read strength, and agent
  type — not a per-visit token readout.
- **One bar carries context occupancy for the whole panel.** It fills as the playback advances, showing
  context resident in the runtime-declared window at the playhead. The portion of the fill beyond the
  owner-selected 500k threshold renders red; **no marker, tick, or danger arc is drawn for the
  threshold itself.** The red is the whole signal, and it stays display-only — never a runtime cutoff,
  eviction trigger, or claim about any model's window size.
- The occupancy quantity the bar plots is settled by ADR-0248: it is a per-request resident-context
  figure, sourced from the host transcript surface, which can fall as well as rise. A billing total is
  monotonic and cannot draw this bar.
- Search is the only non-circular context mark and uses a small magnifying glass.
- A full payload traversal edge is solid. A grey dotted edge means front matter was read without pulling the full body.
- **Branching is carried by the animation, not by a drawn back-link.** When traversal descends a
  pathway and later resumes elsewhere, the tree splits and the abandoned branch simply stops
  progressing. Two branches advance at the same time only when work genuinely ran in parallel, which in
  practice means spawned subagents. Revisits are still recorded in the telemetry and remain answerable
  by query or drill-down; they are not drawn as loop-back lines in the overview.
- Time never runs backwards in the playback. Depth into the Library DAG is the axis that moves both
  ways: a descent indents, a return to a shallower node comes back. This requires deterministic
  `parentVisitId` and followed-edge metadata; where those are absent the traversal honestly renders as
  a single column rather than an inferred tree.
- A causal knowledge fork is shown only when deterministic offered/followed-edge metadata exists. Temporal proximity is not evidence of a fork.
- Parent and subagents occupy linked lanes. A child receives a payload from the parent, runs an independent context window and inner loop, then returns a result to the parent.
- Color and compact icons identify stable agent types, not individual instances. The approved initial types are primary, general-purpose, Explore, and librarian-curator.
- Labels and prose are intentionally sparse at overview level. Detailed words belong in drill-down or in an agent's answer about the telemetry.

## Explicit anti-goals

- No standalone analytics dashboard.
- No card grid, KPI row, or collection of large gauges.
- No per-node gauge, and no threshold marker drawn on any ring or bar.
- No wide central canvas detached from the selected forest story.
- No inferred retrieval edges, hidden idle time, or merged parent/child token accounting.
- No model-authored path diary, compaction control, pruning control, or context limit.

## Reference trace

The mock is shaped from metadata extracted from recorded session `02b6a304-6b29-41d0-9276-b9ce7b8958e3`; no transcript contents or hidden reasoning are included.

- Wall-clock horizon: 7h39m, with explicit multi-hour idle folding.
- Parent: 180 model turns, 186 tool calls, maximum observed input context 240.9k.
- Children: five spawned agents, 208 combined tool calls.
- Child types represented: Explore, general-purpose, and librarian-curator.
- Spawn and result-return lanes are observable in the source trace.
- Causal knowledge forks are intentionally absent because the source trace predates deterministic `parentVisitId`, candidate, and followed-edge metadata.

The trace's occupancy series is load-bearing beyond composition: it **recedes** (240.9k → 228.1k, and
239.8k → 229.6k, with per-visit `added` falling to 0 on those visits). That is the evidence in ADR-0248
that the bar needs a quantity which can fall, and that no existing token field can supply it.

The series was re-derived on 2026-07-27 by running the shipped host-transcript extractor
(`readTranscriptWindow`, story `context-traversal-transcript`) over the same recorded session, which
confirms the numbers the mock draws are `residentInputTokens` and not a re-labelled billing total:
180 parent observations, a 457.9-minute horizon, a 240.9k maximum, three receding steps, and
five-minute bucket maxima that match the mock's column exactly. The mock's per-visit `added` column
was dropped in the regeneration, since a single bar needs one quantity and ADR-0248 D3 deletes that
field.

## Implementation acceptance

A visual implementation is conformant only when:

- it is reached through story island → claimed session → narrow details panel;
- the traversal, not the bar or any metric, dominates the first glance;
- the bar reads occupancy at the playhead and turns red only for the portion past 500k, with no marker;
- no per-node gauge and no drawn revisit loop-back appears;
- parent/child handoffs and time remain legible on an eight-hour trace;
- the dotted/full-read, search, and explicit-only fork semantics above survive;
- a direct comparison against the canonical HTML is presented for owner attestation.

## Revision 2026-07-27

Owner-directed in conversation, and the reason ADR-0248 could be settled:

1. **Per-node gauges retired.** Nodes become plain marks. This buys panel room for depth excursions and
   child lanes, which the gauge glyphs were crowding out.
2. **One playhead bar replaces them.** A bar needs ONE quantity, so "context added by this visit" stops
   being something that must be drawn. ADR-0248 D3 therefore DELETES `addedInputTokens` rather than
   giving it a real per-visit delta — it was a duplicate of `cumulativeInputTokens` and now has no
   consumer.
3. **The threshold marker is gone.** Overflow is shown by colouring the over-threshold portion of the
   fill red. Cheaper than a danger arc, and it survives any window size — including a build leaf's
   200k, where a 500k marker had no meaning.
4. **Revisit loop-backs are not drawn.** The animation carries branching; the data still records the
   link.

Regenerated 2026-07-27. Correction to this file's own earlier account of what was stale: the previous
artifacts rendered per-node gauges and a bottom-of-circle danger marker, but they never drew a revisit
loop-back at all, so clause 4 was already satisfied and cost the regeneration nothing. What changed is
clauses 1–3 plus two things they made possible — a search visit is now drawn as a magnifying glass
*instead of* a circle rather than layered over a gauge ring, and the marks shrank from 6.8/5.2 to
3.4/2.8 units, which is the panel room the revision was after. Depth still renders as a single column:
that waits on `parentVisitId` and followed-edge metadata, which no adapter emits yet.
