# Context traversal visual contract

Status: owner-approved design reference for arc `linked-session-context-arc`.

## Canonical references

- [Playable narrow-panel mock](session-traversal-playback.html) — normative composition and interaction reference.
- [Static reference image](session-traversal-playback.png) — review fallback and visual-regression anchor.

The HTML reference is authoritative when the two differ. The image captures its initial full-trace state at a narrow story-details-panel width.

## Product composition

This is **not a dashboard**.

The traversal opens from the existing forest:

1. The owner selects a story-node island.
2. The story's narrow right-hand details panel shows a dropdown of active sessions that claimed it.
3. Selecting a session renders the traversal playback in that panel.
4. A footprint can be selected or double-clicked to drill into detail; the overview remains primarily pictorial.

The chronological traversal is the dominant picture. Circular gauges are small node glyphs *inside that traversal*, never standalone dashboard cards, summary tiles, or a wall of gauges.

## Visual grammar

- The traversal progresses through time on a compact vertical spine. Confirmed idle spans are folded explicitly rather than removed or visually stretched.
- Context visits are circles. The outer circle is the whole runtime-declared context window; the inner arc is context occupied; the terminal thickness of that arc is context added by the visit.
- The owner-selected 500k danger region is red and display-only. It is not a runtime cutoff. The checked-in trace uses a one-million-token mock ceiling only to demonstrate the geometry; production uses the capacity and occupancy measure declared by the runtime and the accepted decision that resolves ADR-0248.
- Search is the only non-circular context mark and uses a small magnifying glass.
- A full payload traversal edge is solid. A grey dotted edge means front matter was read without pulling the full body.
- A revisit is projected forward as the next visit and linked to its earlier occurrence with a plain line; it does not draw a backward arrow through the traversal.
- A causal knowledge fork is shown only when deterministic offered/followed-edge metadata exists. Temporal proximity is not evidence of a fork.
- Parent and subagents occupy linked lanes. A child receives a payload from the parent, runs an independent context window and inner loop, then returns a result to the parent.
- Color and compact icons identify stable agent types, not individual instances. The approved initial types are primary, general-purpose, Explore, and librarian-curator.
- Labels and prose are intentionally sparse at overview level. Detailed words belong in drill-down or in an agent's answer about the telemetry.

## Explicit anti-goals

- No standalone analytics dashboard.
- No card grid, KPI row, or collection of large gauges.
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

## Implementation acceptance

A visual implementation is conformant only when:

- it is reached through story island → claimed session → narrow details panel;
- the traversal, not gauges or metrics, dominates the first glance;
- parent/child handoffs and time remain legible on an eight-hour trace;
- the dotted/full-read, revisit, search, and explicit-only fork semantics above survive;
- a direct comparison against the canonical HTML is presented for owner attestation.
