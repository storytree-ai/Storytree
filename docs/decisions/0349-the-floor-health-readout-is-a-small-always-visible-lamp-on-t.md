---
status: accepted
decided: 2026-08-12
arc: arc-orientation-surface-arc
amends: [314]
---
# ADR-0349: The floor-health readout is a small always-visible lamp on the map, not a band inside the arc drawer

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12: *"can you
reimagine the factory floor health check as a small self contained visual that shows up somewhere
else"*, on reading the band's own text and noting *"its probably in the wrong place"*. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0314**, which stays current. D7's REQUIREMENT is not reversed and not weakened — the
factory floor must still go loud when a shared bottleneck recurs, still on the distinct-cause unit,
still never on filing volume. What this ADR changes is D7's PLACEMENT clause, and it changes it in
the direction D7's own stated purpose points. Nothing in ADR-0316 moves: the instrument stays on
`factory-floor-health-arc`, and this readout stays its first committed consumer.

## Context

ADR-0314 D7 placed a persistent factory-floor health strip above the arc lanes, on an owner
direction quoted in that ADR: *"when this stuff needs my attention we can make it very visible that
there is something wrong on the factory floor."* The strip was built (#1191) and its figure wired
(#1228). Two defects then showed up in use, and they are different in kind.

**The placement did not deliver the requirement, and the failure was structural rather than
cosmetic.** The band was "persistent" only within the arcs lens, and that lens renders solely under
`?overlay=arcs` — one of three drawer states, and not the default (no param = collapsed). So a
reading whose entire justification was that it *"must reach the owner without the owner going
looking"* was itself behind a drawer the owner had to go and open. The word "persistent" in D7 was
doing work the mount could not support.

**The band also mis-titled the surface it sat on.** `ArcSurface` had no heading of its own — the
drawer's `Arcs | Library` toggle lives in the handle bar BELOW the body — so the band's `factory
floor` label was the topmost text in the lens and read as the name of the whole surface. The owner
hit this directly, reading the band's text as the arc tracking surface's title and asking what the
UI overlay was called. That is two errors at once: the surface was left anonymous, and the band
over-claimed, because it answers a strictly narrower question (*is the floor healthy*) than the
surface does (*where is every initiative up to*). `arc-orientation-lens` already records that
asymmetry — the strip *"is deliberately NOT an arc state"* — but the layout contradicted it.

The forces in tension are visibility against cost. Widening WHEN the reading is visible widens when
it is FETCHED, and this read is not cheap: each call scans the whole friction tier and the whole
library event log, because the `Store` seam filters events by id only. The old five-minute success
cadence was sized for the narrow drawer-open window, and carrying it unchanged into a wider window
would have multiplied whole-corpus scans against the shared store. Against that: the figure moves on
a DAILY grain — a route lands, or a filing is reinforced — so freshness was over-bought at five
minutes even in the narrow window.

## Decision

**D1 — THE READOUT MOVES OUT OF THE ARC LENS AND ONTO THE MAP.** It is `FloorHealthLamp`
(`apps/studio/src/components/FloorHealthLamp.tsx`), mounted by `TreeView` inside `.world-frame`,
docked bottom-right immediately left of the world-settings gear so the two read as one instrument
cluster. `ArcSurface` no longer renders it and no longer ACCEPTS it: the floor-health prop is gone
from its signature, and `ArcSurface.test.tsx` asserts the absence, so re-mounting it there is a
deliberate act rather than a plausible refactor.

**The map is the right home because the map IS the floor.** The world view already draws the
factory — stories as trees, sessions as wisps, claims as lit territory. A lamp over that scene is
the reading in its own context, and it is visible exactly when the thing it reports on is.

**D2 — IT IS AN ANDON LAMP, AND THE THRESHOLD IS DRAWN RATHER THAN ONLY WRITTEN.** A factory floor
already has a canonical instrument for "the line is in trouble", and this is it. The glyph is one
instrument in five conditions (the housing never changes; the bulb and rays do), so `unwired`,
`reading`, `declined`, `quiet` and `loud` stay five distinguishable facts rather than five icons.

Beside it sits a PIP ROW: one pip per required recurrence, filled by how far the loudest cause has
climbed. This is new, and it is what lets the readout shrink without losing the auditability the
band had. The band PRINTED the withheld sub-threshold figure inline because it had a full row to
print it in; the lamp encodes the bar and the climb graphically at rest — a quiet floor showing one
filled pip of two says *"something recurred once and that is below the bar"* without a sentence —
and carries the figure itself one disclosure away.

**D3 — THE DETAIL IS A DISCLOSURE, AND THAT MAKES THE READ-ONLY FENCE MORE EXPLICIT, NOT LESS.**
Clicking the lamp opens a small panel carrying the causes, their recurrences since routing, the
window (ADR-0316 D2) and the collapsing rule IN FULL (ADR-0316 D3). The band had to ellipsise that
~450-word rule onto one line to avoid growing to 100px and shoving the lanes down; the disclosure
gives it room to actually be read, which is what D3 asks for.

The old suite fenced read-only as *"no buttons at all"* — a sound proxy while the reading was
always-open prose, but a disclosure necessarily owns the one button that opens its own provenance.
The fence is therefore restated DIRECTLY rather than relaxed: the only control is the disclosure,
and nothing offers to dismiss, discharge, acknowledge, snooze or mute. ADR-0316 D4 keeps adjudication
with the graduation-synthesist, and that is untouched. The cause links remain READS — the same
click-through into the Library artifact the briefing panel makes (ADR-0314 D3).

**D4 — THE POLL IS GATED ON THE MAP BEING ACTIVE, AND THE SUCCESS CADENCE GOES 5 MIN → 30 MIN.**
`useFloorHealth` now takes `TreeView`'s existing `active` prop (false while App retains the instance
off-route) rather than `drawerLens === 'arcs'`, so a parked forest polls nothing — the same rule the
rest of that view already follows. The failure-retry cadence is unchanged at 30s.

Raising the success cadence is honest rather than merely convenient, and it is the reason D1 does not
buy visibility with store load: on a daily-grain figure a 30-minute worst-case latency costs the
owner nothing, and the wider window at the longer cadence costs the shared store LESS per hour than
the narrow window did at five minutes. A cheaper reading that is always visible beats a fresher one
nobody opens the drawer to see.

**D5 — `ArcSurface` GETS ITS OWN HEADING.** It renders `Arc Surface` as an `h3` above the lanes. This
is the other half of the same defect: with the band gone the surface would otherwise still have had
no name, and the drawer's lens toggle does not fill that slot because it sits in the handle bar below
the body. Named provisionally at the owner's direction (*"Arc Surface is fine for now"*), so a better
name is a rename and not a re-decision.

## Consequences

**Good.** D7's requirement is met for the first time: the reading is visible whenever the map is,
rather than whenever someone has opened a particular lens. The arc surface has a name, and the band
no longer over-claims by borrowing that slot. The reading costs the shared store less per hour than
before despite being visible far more often. The collapsing rule is readable in full instead of
ellipsised, which is closer to what ADR-0316 D3 actually requires. And the threshold became visible
on the surface — the pip row makes `LOUD_AT_RECURRENCES` legible without reading source, which is
what makes settling it at 2 rather than escalating it defensible.

**Bad, and accepted.** The detail is now behind a click, so a `quiet` floor's sub-threshold figure is
one interaction further away than it was; the pip row is the mitigation, and it is a weaker signal
than printed text for anyone who does not learn what the pips mean. The lamp is bottom-right
peripheral chrome, which is discoverable for a LOUD state (warm fill, lit bulb, rays) and easy to
never notice when quiet — acceptable, since a quiet floor is precisely the state nobody needs to act
on, but it does mean the lamp is not a thing the owner will read habitually. The reading is now
absent on the Library routes (`#/doc`, `#/asset`, members), where the map is parked; the band was
absent there too, so this is not a regression, but it is not the "everywhere" that a HUD placement
would have bought. A HUD placement was considered and rejected because ADR-0205 deliberately emptied
that strip down to the avatar, and reversing a stated decision to gain presence on three secondary
routes is a bad trade.

**The capability boundary is now a judgement rather than a derivation, and that is recorded, not
hidden.** `arc-orientation-lens` justified holding the strip partly on the fact that its ONLY
consumer was `ArcSurface.tsx`. That fact is gone — the consumer is `TreeView`. The competence
argument still reaches it (the lens's competence is ORIENTATION, and *whether the factory itself is
in trouble* is one of the four things an owner arriving cold needs), so the file stays in that
capability rather than being orphaned to a story-grain declaration. But this is exactly the kind of
call `story-author` owns, and it is flagged in the capability spec for a look rather than settled by
this ADR.

**Not decided here.** Whether the lamp should also appear on the Library routes; whether the pip row
survives owner review at all (the look is an operator-attested leg under ADR-0070 — the owner signs
it, this ADR does not); and whether `Arc Surface` is the final name for the surface.

## References

- **ADR-0314** — **amended by this ADR.** D7 decided the factory-floor health readout and its
  original placement above the arc lanes; the requirement stands and the placement clause is
  overtaken. D1/D2/D3/D4/D6/D9 are untouched.
- **ADR-0316** — the instrument that computes the reading, on `factory-floor-health-arc`. D2's
  refusal (a decline never reads as calm), D3's collapsing-rule-travels-with-the-figure and D4's
  measure-don't-adjudicate all carry through unchanged; this ADR moves the CONSUMER, never the
  measurement.
- **ADR-0205** — emptied the HUD strip to the avatar; why a HUD placement was rejected.
- **ADR-0110** — design-time alignment is ratification; why this ADR is born `accepted`.
- **ADR-0070** — the look is an operator-attested leg; the owner signs the lamp's appearance.
- `stories/studio/arc-orientation-lens.md` — the capability; contract 8 restated for the disclosure,
  and the ⚠ note recording that the one-consumer justification is spent.
- `stories/desktop/mirrored-route-conformance.md` / `packages/cli/src/mirror-conformance.ts` — the
  `/api/floor-health` mirror is UNAFFECTED (the threshold lives in the compiled bundle both surfaces
  serve, so it has no drift class), but it exists to keep `declined` separable from `quiet`, which is
  why the lamp draws those two differently rather than merely dimming one.
