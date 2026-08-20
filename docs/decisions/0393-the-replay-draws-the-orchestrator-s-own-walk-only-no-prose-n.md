---
status: accepted
decided: 2026-08-20
arc: traversal-panel-arc
---
# ADR-0393: The replay draws the orchestrator's own walk only: no prose, no subagent lanes, no unobservable rays

## Status

accepted (2026-08-20) — decided/directed by the owner in conversation on 2026-08-20. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The traversal replay panel was built out on 2026-08-20 (#1435, #1441, #1446) and staged for the
owner's LOOK the same day, which is the one increment `traversal-panel-arc` had left. The look
happened, and it produced changes. This ADR records them, because three of them REVERSE clauses the
owner signed in ADR-0354 and in `docs/design/context-traversal/README.md`, and a signed clause is not
something an implementation may quietly edit.

What the owner saw was a real 203-event trace spanning nine days: the spine of reads, 41 folded idle
spans, one depth-1 descent, two subagent lanes, 64 offer fans, and six paragraphs of prose under the
picture. Three things came back.

**The prose.** Six explanatory paragraphs plus a facts list sat below the plot. They were written to
be honest rather than decorative — what the trace could NOT show — but they were the bulk of the
panel's vertical, in a panel whose scarce dimension is vertical (ADR-0354 D3/D4 rotated the axis
precisely because height is what the bottom dock has least of).

**The lanes.** Subagent lanes were an explicit acceptance clause: ADR-0354 clause 7, "every rendered
lane names the model it ran on from a recorded field". The owner's verdict on seeing them: "we just
show the orchestrator traversal in the chart, having builder and tester subagents on there isn't
valuable, we can think how and if to show these later."

**The dotted rays.** The offer fans drew a ray per recorded candidate and dashed the ones that could
never be followed. The owner disliked the dotted texture.

**And a defect the objection uncovered, which is why the third change is larger than it looks.** The
legend has always read "solid ray not followed, faint dashed unobservable" while the stylesheet drew
`status-not-followed` with `stroke-dasharray: 2 2`. The panel's own key disagreed with the panel.
That mattered far more than a stray declaration usually would: nothing is ever followed in practice —
measured on the very trace being looked at, 373 branches offered and 0 followed — so EVERY ray in
EVERY fan was a dash, and the dotted texture the owner objected to was overwhelmingly the
not-followed rays rather than the unobservable ones he was asked about. The question put to him
described the legend, which was the half telling the truth about the grammar.

## Decision

**D1. NO PROSE UNDER THE PICTURE.** Every explanatory paragraph below the plot is deleted — the
occupancy absence and its remedy, the lane-span caveat, the session-depth reading, the
knowledge-depth distribution, the offer denominator, the unplaced-events count, and the replay facts
list. The foot holds the legend and nothing else.

Asked directly whether to collapse them behind a "what this can't show" disclosure instead, the owner
chose deletion. They are DELETED rather than hidden behind a flag, because a hidden component is one
a later reader restores by accident.

**The knowledge-depth reading is RE-HOMED, not deleted with them** — as a counts chip on the axis
line ABOVE the picture, beside the mark and fold counts it belongs with. It carries the corpus-wide
anchor figure, which is the half that stops a thin per-trace count reading as an indictment of the
session rather than as a fact about how little of the corpus names any work (ADR-0363 D2; 44 of 1,620
artifacts anchor the walk). Its full three-state reading rides the chip's hover.

**D2. NO SUBAGENT LANES.** The parent/child lane rows, their agent-type + model chips, and their
handoff/return edges are not drawn. The picture is the orchestrator's own walk.

This reverses ADR-0354 clause 7 and the lane half of that ADR's end state. It does NOT retract the
TELEMETRY, and the distinction is the whole reason "later" stays cheap: `spawn_handoff` /
`result_return` keep their optional `model` / `runtime` fields (#1272), the replay route keeps serving
them, and `lib/traversalLanes.ts` keeps folding them — pinned by a test, so a later trim cannot take
the capture out from under a future lane surface. Whether lanes return, and in what form, is
deliberately left open by the owner.

The axis still counts a spawn as ACTIVITY, and that survives on its own merits rather than by
inertia: a parent waiting on a child is busy, so that span is not idle, and dropping it would fold
real elapsed work into an idle stub.

**D3. NO UNOBSERVABLE RAYS, AND NO DASHES IN A FAN AT ALL.** The `unobservable` rays — branches
pointing at an ADR file, which no library read can open — are not drawn. `not-followed` and
`ambiguous` become SOLID, which is a defect fix rather than a taste change: the legend already
claimed solid, and the stylesheet was the half that was wrong.

**ADR-0312 D6's raw `M of N` denominator is NARROWED, NOT REPEALED, and the difference is stated so a
later change cannot cross the line by accident.** Every fan still carries `offered N, observable M of
N` on its hover title and on `data-offered` / `data-observable` / `data-followed`, and no percentage
or ratio is introduced anywhere. What changed is the denominator's SURFACE, from drawn-and-stated to
stated. A change that drops the hover and the attributes too WOULD be the repeal, and would need its
own decision.

**D4. THE SIGNED GRAMMAR OTHERWISE STANDS.** One playhead occupancy bar, red only past 500k, with no
marker for the threshold; plain marks with no per-node gauge; a magnifying glass for search;
branching carried by animation rather than drawn loop-backs; no depth ever inferred from order, time
or the node graph. **The dotted SPINE edges stay** — offered both dotted elements, the owner named
the fan rays only, and a dotted spine segment means a front-matter-only read against a solid
full-payload one, which is read strength and the one thing that edge weight has ever meant.

## Consequences

- **Good, and it is the point.** On a ten-lane trace the lane rows were 10 of 12 rows, so the
  orchestrator's own walk — the subject of the picture — was squeezed into a sixth of the height it
  now gets. The prose took the rest. The panel's scarce dimension goes to the thing being looked at.
- **Good.** The fan stops drawing roads that do not exist. On the trace the owner looked at, 112 of
  373 rays stood for branches nothing could ever have taken.
- **BAD, KNOWINGLY ACCEPTED, AND THE ONE TO WATCH: a PARTIAL trace now looks like a complete one.**
  The `PARTIAL: N lines could not be read` warning (ADR-0241 D5) had no other surface in the panel.
  It is still composed by the route and still printed by `storytree traversal show <sessionId>`, so
  it is answerable — but only to an operator who thinks to ask. This cost was put to the owner in
  those words and accepted. If a misread ever traces back to it, restore that one line rather than
  the six.
- **Bad, smaller.** The occupancy absence keeps its dashed track and its `aria-label` but loses the
  sentence naming its REMEDY (`storytree traversal ingest <sessionId>`), so an operator who has never
  ingested a session sees an honest absence with no visible way forward.
- **Neutral.** `traversal-panel-wide-attestation` — the increment this look belongs to — is NOT
  closed by this ADR. The look produced changes; the changes need looking at.

## References

- ADR-0354 — the bottom-panel placement and the re-flow, whose clause 7 D2 reverses in part.
- ADR-0312 D6 — the raw `M of N` observability denominator, narrowed in surface by D3.
- ADR-0363 D2 — the read-only depth-from-work join whose reading D1 re-homes.
- ADR-0241 D5 — the partial-trace honesty rule whose panel surface D1 removes.
- ADR-0110 — design-time alignment IS the ratification; this ADR is born accepted.
- `apps/studio/src/components/TraversalSpine.tsx`, `TraversalReplay.tsx`, `src/index.css`.
- `docs/design/context-traversal/README.md` — signed for GRAMMAR; D4 states what of it survives.
