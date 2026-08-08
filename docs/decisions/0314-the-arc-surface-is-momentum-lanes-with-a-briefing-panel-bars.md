---
status: accepted
decided: 2026-08-05
amends: [267]
arc: arc-orientation-surface-arc
---
# ADR-0314: The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable

## Status

accepted (2026-08-05) — decided/directed by the owner in conversation on 2026-08-05. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends **ADR-0267**, which stays current: this ADR answers the two things D3 and D7 deliberately left
open (where the demoted Library goes, and what `blocked` means) and fixes the layout D1 assigned to
the drawer's primary slot. ADR-0267 D6's read-only fence is untouched and re-affirmed below.

## Context

ADR-0267 D1 reassigns the map's primary top-drawer slot from the Library lens to arcs, and D7 names
the states the surface must distinguish — running, `waiting`, `blocked` — while defining only
`waiting` and saying outright that a session which invents a `blocked` predicate has exceeded the
decision. Increment 1 (#1020) built the infrastructure: `arcRef` on the `open-question` kind, the
guarded write path, and the shared join `deriveArcRollup`/`loadArcRollup`/`loadArcRollups` in
`packages/drive/src/arc-rollup.ts` that both `storytree arc show` and `GET /api/arcs` render from.
Increment 2 (#1087) delivered four mock layouts against real data and stopped, putting three
questions to the owner. Those questions went unanswered for two days; this ADR records the answers.

**The owner looked on 2026-08-05 and picked option B, modified.** The mocks were re-rendered first,
because the population had moved enough to invalidate the numbers the pick would have rested on:
17 → **20** active arcs, 15 → **27** closed, and — the part that matters — **10 of today's 20 active
arcs did not exist on 08-02, while 7 of that round's 17 have closed**. Half the board turned over in
three days. Three measurements taken at the same time shaped the decisions below.

1. **The `waiting` state has no source of content at all.** At the mock round the open-question tier
   held exactly one question, and the finding was that it was *unhomed* — it carried no `arcRef`, so
   under D4's derived view no arc surfaced it. Re-measured today the tier is **empty**:
   `library artifact list open-question --pg` returns 0 and all 20 arcs come back `waiting: false`.
   The trajectory over three days is 1 → 0. This is not a gap a layout can close.
2. **Parked work is the biggest thing on an arc and no mock drew it.** ADR-0298 D1's parked entries
   postdate the 08-02 extract. Measured today: **40 entries across 12 of the 20 active arcs**
   (`verification-integrity-arc` 12, `cli-write-fidelity-arc` and `session-decoupling-arc` 7 each).
   Every mock renders "next" as *ready plan / proposed ADR / nothing queued* and therefore answers
   "nothing queued" for arcs carrying a dozen parked items.
3. **The `blocked` candidates degrade at today's density.** B3 "gone quiet" now lights 8 arcs and
   leaves the `quiet` bucket holding exactly **1** — `blocked` and `quiet` collapse into near-synonyms,
   which they did not at 17 arcs. B2 "never started" doubled 3 → 6. Only B1 held at 1. The candidate
   the mock round leaned toward is the one that aged worst, which is precisely what re-rendering
   before the pick was for.

## Decision

### D1 — The layout is momentum lanes (mock option B), with the time axis removed

One lane per arc, as option B proposed. The shared 6-week date axis is **deleted**. It was the
feature that made staleness a shape rather than a label, but it spent roughly 60% of its width on
empty space — at today's recency distribution almost every landing sits inside the last 7 days,
bunched against the today-line.

### D2 — Bars are units, not time: green for landed, grey for not yet

Each lane draws one bar per increment: **green for a closed (landed) increment, grey for one not
completed yet**. Position along the lane carries no date meaning. This is what frees the horizontal
space D3 spends.

**This is not the progress bar ADR-0267's Context rules out, and the distinction is load-bearing.** A
percentage bar claims a denominator; an arc has none, because `endState` is prose rather than a
checklist. Green-and-grey bars claim only what is *known*: these units landed, these are queued. An
arc with 3 green and 2 grey is not "60% done" — it is an arc with five known units, and the surface
never asserts that five is all of them.

D2 also closes Context finding 2: parked work stops being invisible, because a parked entry is
exactly a grey bar.

### D3 — The freed right-hand side is a briefing panel, and it is where the owner acts

The space the deleted axis returns becomes a preview panel showing **what is waiting on the owner** —
open questions and anything else halted on their decision. The panel carries **click-through into the
actual Library artifact** holding the question, so the owner can reach whatever they need to answer it
properly: the briefing, diagrams, mocks. The studio already routes `#/asset/<id>` and
`#/doc/<relpath>`, so this is deep-linking rather than a new surface.

This composes option C's reading room into option B's index, which is what the mock round said the
four options were for ("a build could take one layout's index and another's detail pane"). The panel
defaults to the selected arc's briefing and shows waiting items when there are any.

### D4 — `waiting` and `blocked` stay separate: answerable versus stuck

ADR-0267 D7 names both and forbids collapsing them. They are defined here as:

- **`waiting`** — an authored open question with a briefing is sitting on this arc. It is
  **answerable right now**, from the panel, without a re-onboarding round trip.
- **`blocked`** — the arc cannot proceed and **there is nothing for the owner to answer**. Two
  sources: a **claim it cannot take** on the story nodes / capabilities it needs, and an unmet
  dependency on other work.

The test between them is *can the owner discharge this by reading and replying?* Yes → `waiting`. No
→ `blocked`. This deliberately rejects the mock round's three derived candidates: B1/B2/B3 all
answered "has this arc been quiet", which is a *symptom* rather than a *cause*, and Context finding 3
shows B3 ceasing to discriminate at today's density. `quiet` remains a state, and now means what it
says — moving slowly, nobody stuck.

The owner's expectation is that `blocked` will read "waiting on me" most of the time. That is a
prediction about the data, not a third definition.

### D5 — Escalating authors an open-question briefing

**An orchestrator that escalates to the owner MUST author an `open-question` artifact carrying an
`arcRef` and a briefing answerable cold.** Escalating in chat alone is no longer sufficient.

This is the fork that decides whether this surface ever has content, and Context finding 1 makes it
decisive rather than academic: agents escalate in chat today, which is exactly why the tier holds
zero questions and every arc reports `waiting: false`. Without D5 the entire waiting half of the
surface — the panel, the state, the lane marker — is permanently decorative. The retired
`oq-diff-view-altitude` (recoverable from git at `4337959a`, dissected in #1087) is the worked
example of the briefing shape: enough context attached to answer the question rather than merely
find it.

D5 is a change to orchestrator discipline, not to the studio. It does not depend on D8's sequencing
and is separable from the surface build.

### D6 — The Library becomes a toggle in the drawer header

This answers **ADR-0267 D3**, which left the demoted Library's home open. An `Arcs | Library` toggle
in the drawer header — the same slot, one click, arcs as the default. Option B's own proposal ("a
second lens on the same time axis") died with the axis in D1, so the answer is borrowed from option A.

### D7 — Factory-floor health is a persistent strip above the lanes

The surface carries a **factory-floor health signal**, not only per-arc orientation: a band across the
top of the drawer that stays quiet when the floor is fine and goes loud when a shared bottleneck
recurs. Owner-directed 2026-08-04 and parked on this arc as `factory-floor-health-signal`: *"I think
this will be solved when we setup the arc tracker/dashboard so when this stuff needs my attention we
can make it very visible that there is something wrong on the factory floor."*

It is deliberately **not** an arc state. Every per-arc state answers *what is the state of THIS arc*;
none answers *is the floor healthy*, and the same bottleneck hit eight times in a week lights up no
arc state at all. Persistent placement is the point — it must reach the owner without the owner going
looking.

**The unit is the DISTINCT bottleneck and its recurrence rate, never filing volume.** This is the trap
that closed `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`: both its closing metrics
counted filings, and a hundred reports of one bottleneck scores identically to a hundred reports of a
hundred bottlenecks while meaning the opposite.

### D8 — The build waits for ADR-0305's increment tier

D2's grey bars and D4's claim-blocked both need state that does not exist yet, and the owner chose to
wait for it rather than build an adapter over the shape it replaces.

- **D2** is ADR-0305's model exactly: that ADR (accepted 2026-08-04) collapses `increments[]`,
  `proposals[]` and the `plan` kind into one `increment` tier with lifecycle
  `proposal → ready → active → closed`. Green is `closed`; grey is the other three. Verified
  2026-08-05: the tier is **not built** — the schema still carries the `plan` kind and the two arrays
  — and a sibling session holds a live claim to migrate it.
- **D4's claim half** needs ADR-0306 (increments cite stories and capabilities as resolvable
  pointers) and ADR-0308 (increments carry their own claim set). Measured today, only **3 of 20**
  active arcs carry a story stamp, so arc → story → capability → claim cannot be computed for the
  other 17. The edge that makes it derivable is the one ADR-0306 adds.

Building against today's two-array shape would mean building on rows a session in flight is deleting.
The surface build is therefore parked on this arc until the tier lands.

**THE TIER LANDED THE SAME DAY — the blocker is CLEARED and this decision is already satisfied
(corrected in place per ADR-0139; the decision is unchanged, only its status).** ADR-0305 D1/D2
merged to `main` on 2026-08-06, hours after the choice above was made: `packages/cli/src/plan.ts` is
renamed `increment.ts`, `KnowledgeKind` carries `"increment"`, and `IncrementStatus` is the
enum-fenced `proposal | ready | active | closed`. The live rows migrated cleanly — this very arc now
reads **2 closed** in its increment log and **3 proposal** in its Work view, which is exactly D2's
two green bars and three grey ones, already derivable from stored state.

So the wait D8 chose cost hours rather than days, and the adapter it declined was never needed.

**AND THE SURFACE HAS NOW SHIPPED** (corrected in place per ADR-0139; the decision is unchanged,
only its build state). The `arc-surface-lanes-and-briefing-panel` unit landed 2026-08-06 — lanes
with no axis, green/grey unit bars off the `increment` tier, the briefing panel with click-through,
the `Arcs | Library` header toggle, and D7's strip as a frame. It renders from `GET /api/arcs` —
drive's one join — and measured against the live store on the day it landed it drew **20 active
lanes and 203 bars, 167 landed against 36 queued**, which is D2's model working on real rows with no
adapter anywhere.

What remains genuinely blocked is only D4's claim half, which still needs ADR-0306/0308's
per-increment claim set and resolvable unit pointers. The shipped surface leaves `blocked` **unlit
and says so on the panel** rather than substituting one of the rejected predicates — an owner told
the surface distinguishes `blocked` must be able to see that it currently cannot, instead of reading
its absence as "nothing is blocked".

### D9 — Read-only still holds

ADR-0267 D6 is unchanged: no comment affordance, no answering in place, no write path. D3's
click-through is a read, and D5's briefing is authored by the escalating session, not by the owner
through this surface. A two-way surface remains a deferred follow-on whose trigger is the owner's
("once i get a feel for this").

## Consequences

**The surface finally has a specified shape, and it is cheaper than the mock it came from.** Deleting
the axis removes the densest rendering problem in option B and pays for the panel that makes the
surface answer questions rather than merely list them.

**Nothing rendered until ADR-0305 landed, and it landed the next day.** This was the cost the owner
accepted in D8, chosen over an adapter, and it came to a wait of hours: `arc-orientation-surface-arc`
took a hard dependency on `arcs-hold-increments-arc`, which was in flight rather than idle (#1153 on
2026-08-05), and the tier merged 2026-08-06 with the surface following the same day. The contingency
this paragraph reserved — falling back to the adapter D8 declined rather than redesigning — was never
reached.

**D5 changes agent behaviour, and it is the load-bearing half.** The surface can be built perfectly
and still show an empty panel forever if escalations keep happening only in chat. D5 has no
dependency on D8 and should land first; it is tracked as its own unit on the arc.

**D5 HAS LANDED, and it did land first (corrected in place per ADR-0139; the decision is unchanged,
only its build state).** The `escalation-authors-an-open-question-briefing` unit on
`arc-orientation-surface-arc` shipped 2026-08-06, ahead of D8's surface build as this paragraph
directed. Two halves: `storytree question new` scaffolds an `open-question` from flags, with `--arc`
**required at the verb** — even though `OpenQuestion.arcRef` is schema-optional — and required to
RESOLVE to a real arc. Context finding 1's unhomed question is the measured failure that fences
against, and an unhomed question is not a lesser question but an invisible one. Second: the
`session-orchestrator` agent's `workflow` step 7 and `escalation` field now bind
escalating-authors-the-question. The
ceremony half is `asset:merge-ceremony` step 10(b), where the escalation landing now produces two
artifacts — the arc entry as the residue and the authored question as the ask.

Two sub-decisions this D5 deliberately left to the builder were settled **from the corpus rather than
escalated**, and are recorded here because a later reader will otherwise re-open them. (1) *Which
escalations it binds:* the one the session is **ENDING** on — ADR-0303's escalation-as-landing
ceremony already covers both the mid-unit owner gate and ADR-0275 D2's post-merge owner-gated hard
end, so both are bound; an inline approval the session is standing by to act on within the same turn
is **not**, because it closes with the turn and an artifact would outlive its own question. (2) *How
it is enforced:* as **discipline**, not a gate rung, on ADR-0168 D1's finding that a compliance gate
prices a ceremony toward theater. That second call has a standing counter-argument which is
deliberately not resolved here — [ADR-0279](0279-a-corpus-mandated-ceremony-that-only-an-agent-s-discretion-e.md)
(`proposed`, `amends: [95]`) argues that a corpus-mandated ceremony only an agent's discretion
enforces is not mandated at all. If the owner ratifies ADR-0279, D5's enforcement half is what it
reaches first.

**D4 rejects every predicate the mock round offered.** B1/B2/B3 were all derivable today, and
`blocked` as defined here is derivable for almost no arc until ADR-0306/0308 lands. That is a
deliberate trade of availability for meaning: a `blocked` that lights up 8 arcs by conflating
"nobody has touched this" with "this cannot proceed" would train the owner to ignore it.

**`quiet` becomes load-bearing.** With B3 rejected, an arc that has been still for a week and is
neither waiting nor blocked reads as quiet — accurate, and no longer competing with `blocked` for the
same arcs.

**The mock round's data is stale within days.** Half the active arcs turned over in three days, which
is itself evidence for D7's floor-health strip: a portfolio moving that fast is one the owner cannot
track by memory between sessions.

## References

- [ADR-0267](0267-arcs-take-the-map-s-primary-top-drawer-slot-the-library-beco.md) — amended here:
  D3 (Library placement) and D7 (`blocked`) are answered; D1's slot assignment and D6's read-only
  fence stand.
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — the increment
  tier D2's bars and D8's sequencing depend on.
- [ADR-0306](0306-typed-work-hierarchy-refs-increments-cite-stories-and-capabi.md) /
  [ADR-0308](0308-increments-form-a-dag-and-carry-their-own-claim-set-depends.md) — what makes D4's
  claim-blocked derivable.
- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) — the parked entries
  that become D2's grey bars.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this ADR is born `accepted`.
- [ADR-0279](0279-a-corpus-mandated-ceremony-that-only-an-agent-s-discretion-e.md) — `proposed`; the
  standing counter-argument to D5 shipping as discipline rather than as a gate rung.
- `packages/drive/src/arc-rollup.ts` — the one join both surfaces render from (increment 1).
- `apps/studio/src/components/ArcSurface.tsx` + `apps/studio/src/lib/arcSurface.ts` — the shipped
  surface (D1/D2/D3/D4/D9); `apps/studio/src/components/FloorHealthStrip.tsx` is D7's frame, whose
  figure waited on `factory-floor-health-arc`'s instrument (ADR-0316 D5), which LANDED 2026-08-08 as
  the report-only `storytree factory health` — so the figure is now unwired only pending
  `wire-the-floor-health-figure`, its own increment, not pending an instrument that does not exist
  (corrected in place per ADR-0139; the decision is unchanged, only its build state).
- `packages/cli/src/question.ts` — the `storytree question new` verb that realizes D5, and
  `asset:merge-ceremony` step 10(b), where the escalation landing runs it.
- `docs/research/arc-surface-mocks-2026-08-05/` — the re-rendered options the owner picked from, and
  the measurements quoted in Context.
