---
status: accepted
decided: 2026-08-12
arc: traversal-panel-arc
---
# ADR-0354: The context traversal replay lives in a bottom-panel tab beside the terminal, listed by trace not by claim

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

`docs/design/context-traversal/README.md` is owner-signed, and its first implementation-acceptance
clause reads: the replay "is reached through story island → claimed session → narrow details panel",
and is "not a standalone page, dashboard, card grid, KPI row, or wide detached canvas". Everything
`traversal-panel-arc` built — six landed increments — honoured that placement, and the Option A
grammar was chosen over two wider alternatives precisely BECAUSE it survives the panel's `PANEL_MIN`
of 360px.

Staging the arc's last increment, `traversal-panel-attestation`, for the owner's LOOK is what
falsified the placement. Two measurements did it:

**1. The claim-join cannot reach the traces.** The picker offers a session only when that session
holds a live claim on the selected story (`apps/studio/src/lib/traversalPicker.ts` — a deliberate,
well-argued join between "who claimed this" and "what can be replayed here"). Measured on this
machine 2026-08-12: **339 local traces, and exactly one reachable through the panel** — and only
because the staging session took an `exploring` claim on `studio` in order to manufacture a row.
The join is a category error, and the honesty argument that produced it does not reach the real
problem. A claim is a LIVE coordination signal that a session is writing now; a replay is
RETROSPECTIVE by construction. Gating the second on the first means an operator can only watch a
session they manage to catch mid-flight, and every completed session — which is nearly all of them —
is unreachable. The owner named this directly: *"sessions can be selected in sequence rather than me
having to catch one while it's working on a storynode."*

**2. The 360px cap is spending its width on the wrong thing.** The signed README records that
retiring the per-node gauges "buys panel room for depth excursions and child lanes, which the gauge
glyphs were crowding out", and that the marks shrank from 6.8/5.2 to 3.4/2.8 units to find that room.
Depth excursions, child lanes and offer fans are exactly the three things THIS arc added
(`traversal-panel-lanes-and-depth`). The grammar is therefore still paying a width tax to fit a
container it no longer has to live in.

The container is available. The owner reports not using the studio's built-in terminal much,
preferring to drive the system from Claude Code desktop — while wanting the CLI kept for operators
who do drive from inside. The bottom panel is wide, under-used, and already present in the shell.

## Decision

**D1. The context-traversal replay moves OUT of the story details panel and into a TAB in the bottom
panel, a sibling of the existing terminal.** The terminal stays exactly as it is and remains a tab;
this adds an alternative, it does not replace the CLI. Acceptance clause 1 of
`docs/design/context-traversal/README.md` is superseded by this ADR: the replay is no longer reached
through story island → claimed session → narrow details panel.

**D2. The session list is THIS MACHINE'S WHOLE TRACE INDEX, newest first — the claim-join is
withdrawn.** `GET /api/traversal/sessions` already answers the full index in ~10ms warm
(`traversal-panel-index-read`, PR #1288), so the list is ordered by last-observed and needs no claim,
no story selection, and nothing caught in flight. What `traversalPicker.ts` got RIGHT is retained and
is not weakened by the withdrawal: a session with no readable local trace is still offered-and-
explained rather than silently dropped, and the hosted studio — which captures no operator traces —
still answers an honest empty list rather than inventing one.

**D3. The picture RE-FLOWS to the bottom panel's width, and that reopens the visual grammar
deliberately.** Lanes may sit side by side, depth may take real horizontal room, and the axis may
stretch. This is the one thing `traversal-panel-arc` told itself not to do ("do not re-mock the
grammar"), and it is being done knowingly because the constraint that shaped the grammar is gone.
What is NOT reopened is the semantic content, which stays exactly as signed: one playhead occupancy
bar with the over-500k portion red and NO threshold marker; plain node marks with no per-node gauge;
solid full-payload and grey dotted front-matter edges; a magnifying glass for search; branching
carried by animation rather than drawn loop-backs; explicit-only forks with a raw `M of N`
observability denominator and never a percentage (ADR-0312 D6); and no depth ever inferred from
order, time or the node graph.

**D4. A new composition reference at width is OWED, and the owner LOOKs at it BEFORE build.**
`session-traversal-playback.html` remains the normative reference for the GRAMMAR and stays valid as
such; it is no longer the reference for LAYOUT. The re-flow is a design increment that produces a new
mock and an owner LOOK on the composition, and only then a build increment. Building the wide layout
against a guess would forge exactly the reference evidence the design doc protects.

**D5. `traversal-panel-attestation` closes UNSIGNED, overtaken.** It exists to have the owner sign
seven clauses against the real implementation, and clause 1 is the clause this ADR reverses — so
signing it would ratify a placement already superseded. It is closed with its reason rather than
minted again (ADR-0305 D2: there is no `superseded` increment status; the difference between the two
terminal states is a REASON, not a state). The staging itself is not wasted: it is what produced the
evidence above.

## Consequences

The replay becomes reachable for every session this machine has ever traced instead of for whichever
one happens to hold a claim, which is the difference between a usable surface and a demo. It also
gains the horizontal room the three metadata additions were drawn for.

The cost is honest and worth naming. Three of the six landed increments keep their value untouched
because they are not layout: the spawn model/runtime fields (#1272), the read route (#1275), and the
index read (#1288). Two are partly re-worked: the spine (#1280) and the lanes/depth/offers (#1284)
keep every pure lib — `traversalTime`, `traversalOccupancy`, `traversalSpine`, `traversalLanes`,
`traversalDepth`, `traversalOffers`, and their 76 red-green tests, which assert semantics rather than
placement — but the SVG composition that packs them into `viewBox="0 0 360 H"` is redrawn. One is
retired outright: the session picker's claim-join (#1278), whose `traversalPicker.ts` join is
withdrawn by D2 while its offered-and-explained honesty survives in the new list.

The `PANEL_MIN=360` viewBox test that proved width by construction no longer describes the target and
must be re-pointed at whatever the new composition's bounds are; do not simply delete it, because the
two-part shape it belongs to (a jsdom bounds test the browser probe cannot replace, plus a browser
probe the bounds test cannot replace) is what caught real CSS overflow.

Two acceptance clauses could not be walked live during staging and remain unproven against a real
render, independently of this move: no local trace crosses the 500k occupancy threshold (the richest
peaks at 430,616, so the red never appears — the rule is red-green in `traversalOccupancy.test.ts`
and the design README's own precedent is to exercise it directly and say so), and no locally-traced
session that carries a `spawn_handoff` pair holds a claim, so lanes and their model badges — this
arc's own multi-provider clause — have never been seen on a real render. D2 fixes the second of these
as a side effect: with the claim-join gone, `fervent-feistel-259503` and `clever-mestorf-1041a3`
become selectable and their lanes become attestable.

This ADR reopens a signed design. That is a real cost and the reason it is an ADR rather than an edit:
the placement decision is now recorded where a later reader will find it, instead of the design doc
quietly disagreeing with the code.

## References

- `docs/design/context-traversal/README.md` — the owner-signed visual contract; its acceptance clause
  1 is superseded by D1, its width premise by D3, and its layout authority by D4.
- `docs/design/context-traversal/session-traversal-playback.html` — normative for grammar, no longer
  for layout (D4).
- ADR-0110 — owner direction in conversation IS ratification; why this is born `accepted`.
- ADR-0139 — a genuine re-decision is supersede-and-replace, not a correction in place.
- ADR-0241 — traces are local, per-session, append-only JSONL; the index D2 reads.
- ADR-0248 — `residentInputTokens`, not the monotonic billing total, is what the bar plots.
- ADR-0305 D2 — the increment lifecycle has no `superseded` status; D5 closes with a reason.
- ADR-0312 D6 — an offer set states a raw `M of N`, never a percentage (retained by D3).
- `apps/studio/src/lib/traversalIndex.ts` — D2 as built. It replaced `lib/traversalPicker.ts`, which
  carried the withdrawn claim-join and was DELETED rather than left dead when D2 landed; the honesty
  that lived beside the join — pending / failed / empty kept distinct, an undated trace offered and
  explained, the searched directory carried with the answer — moved here intact.
- `apps/studio/src/components/BottomDock.tsx` — D1 as built: the tab host that owns the panel frame,
  with `TerminalDock`'s contract-12 `host` seam as how the terminal became a pane without changing.
- `apps/studio/src/components/TraversalSpine.tsx` — the 360-wide composition redrawn by D3.
