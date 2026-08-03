---
status: accepted
decided: 2026-08-02
arc: act2-intro-forest-regrow-arc
amends: [282]
---
# ADR-0286: The forest regrows on first arrival each session, paced by a world-settings dial

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The owner watched increment 2 in the real app and stamped the growth itself: *"this looks great
otherwise"* — the ADR-0070 stage-2 verdict on the causal, edge-driven schedule (ADR-0283 D1 as
amended by ADR-0285). **That verdict stands and nothing here redesigns it.** In the same sitting the
owner named four things still wrong, verbatim:

> "hide the ghost hexes until each island forms, this looks great otherwise, its probably too fast
> we should have the forrest grow at launch, and then the regrow it option as well as the speed it
> does it can be moved to the world settings"

Three of those are design forks the owner directed and this ADR records. (The fourth — the ghost
hexes — is a defect fix, not a fork; it is described under D1 because it is the same increment and
the same claim, but it needed no decision.)

**Where the regrow lived.** ADR-0282 D6 put it behind `?act2=intro` and promised the clean Studio
route stayed byte-identical. That was the right call for something unproven. It is the wrong call
for something attested: a title sequence nobody arrives at introduces nobody.

**How fast it ran.** 7.0 s wall clock on the real 40-island corpus. That is not drift — increment 1
ran 12.4 s and ADR-0285 halved the plan by removing the ordering clamp, which was the whole point of
that decision. The pace is now a consequence of the graph's own pathway geometry, and the owner's
read is that the graph alone paces it too briskly to follow.

**Where its controls lived.** An on-map `Act2IntroControl` panel — fine behind a debug flag, wrong
as permanent chrome over the product. Meanwhile ADR-0283 D2 had just retired the Layout picker,
leaving the gear holding Art style + Selection and room for a section.

## Decision

### D1 — the pale coast belongs to an island, and lands with it

*(the defect fix, recorded here for one place to read the increment)*

`world.empties` — the two rings of pale hexes around claimed land — was derived from the UNION of
every territory's tiles, so it carried **no owner**. The Act 2 regrow's per-story hide is keyed on
story ids, so it could not reach the moat at all: the map drew the whole forest's hexagonal
silhouette from frame one and pre-announced every island before it existed. It was the single
biggest thing left undercutting the "grows from nothing" claim.

Each coast hex is now **attributed** to the territory whose land it grew out of, propagated through
the existing ring walk (ring 0 inherits the claimed tile it touched, ring 1 inherits the ring-0 hex
it grew from; a hex two islands both reach goes to whichever the deterministic walk reaches first).
`SceneEmptyHex.owner` carries it into the scene, and the `empty` node carries the resolved story id.

**The moat reveals when its island has SETTLED, not when it starts accreting.** The hexes ring an
island's FINAL footprint, so revealing them at the start of accretion would draw a pale halo around
a single cell — the same pre-announcement, one island at a time. The render layer therefore carries
a second set (`hiddenEmptyStoryIds` = absent ∪ growing) rather than reusing the island one.

Attribution is OPTIONAL end to end: an unattributed coast hex is never hidden, so the website fold
and every existing caller render byte-for-byte as before.

### D2 — the regrow plays on the FIRST arrival at the map, once per browser session

Owner-decided, choosing explicitly between three options: every load, first visit per session, or
staying behind `?act2=intro`. **First visit per session.** A `sessionStorage` flag is read once at
mount and written in an effect; the regrow plays on that first arrival and the map is a normal
static map for the rest of the session.

The flag **fails toward playing**: no storage, or a browser that throws on it, reads as a first
visit. A viewer who blocks storage should still get the introduction, and the cost of being wrong is
one extra regrow.

`prefers-reduced-motion` never starts one — it settles straight onto the grown forest, exactly as
ADR-0282 D6 already had it.

**This narrowly AMENDS ADR-0282 D6.** That decision promised the clean Studio route stayed
byte-for-byte unchanged, and it no longer does: arriving at `#/tree` for the first time in a session
now plays a regrow. Said out loud rather than slipped in. What ADR-0282 D6 was protecting — that the
app owns the clock, that nothing is asset-owned, that reduced motion settles on the grown forest —
is untouched.

`?act2=intro` survives with a narrower job: it FORCES a play regardless of the flag, and it is the
only thing that mounts the diagnostic `Act2IntroControl` readout (depth, islands landed, pathways
growing, percent). That readout is what a measurement run needs and the gear deliberately does not
carry.

### D3 — the transport moves into world settings

The owner-facing controls move to the gear panel, in a new **Forest intro** section:

- **"Regrow the forest"** — a replay button. It is an ACTION, not URL state, so it does not go in the
  `worldSettings` schema: the panel gained an `actions` prop and TreeView supplies this one. Inventing
  a param for a one-shot would put a value in every shared link that has to be scrubbed on read.
- **Regrow speed** — a schema dial, `?regrowSpeed=`, which the URL does carry.

First arrival and the replay button run through the **same** start path (a token the effect plays
once), so there is no second way to begin a regrow that could drift from the first. The machinery is
built only once a regrow has been asked for — a session that has already seen it pays for no plan
and no per-island accretion walk.

### D4 — the default pace is the dial's slowest setting

`1` on the dial means the plan's OWN duration — the pace the routed pathway geometry derives,
**measured 6.8 s** on the real 40-island corpus. The default is **0.25×**, the dial's floor, with the
dial opening upward from there (0.25×–2×). For scale: increment 1 ran 12.4 s and was never called
long; increment 2 ran 7.0 s and was.

**AMENDED 2026-08-03, by the owner, on the LOOK verdict this decision was built toward.** This shipped
at 0.6× (measured 11.6–12.9 s), reasoning that ~12 s was near increment 1's uncriticised 12.4 s. The
owner watched the finished regrow, stamped it — *"this looks great"* — and in the same breath took the
pace to the floor: *"I think we down the speed to 0.25, the lowest setting."* The 0.6× figure is
recorded here as what was tried rather than edited away, because it is the evidence that this dial
needed a look and not an argument: the ~12 s estimate was defensible and still wrong.

The default therefore sits ON `min`, deliberately. That is not a boundary to tidy later — the owner
asked for the slowest the control offers, so the floor is a value someone chose. If a future look
wants slower still, `min` moves and the default follows it; `clampMin` (0.05, below `min` and
unreachable from the slider) is what actually protects the cursor from a hand-written URL.

A default that is not 1× is deliberate and slightly odd, so: the alternative was to re-tune
`FOREST_REGROW_TUNING` and keep the dial at 1×, which would have moved every island's position in
the run and put ADR-0285's measured numbers out of date for a pacing preference. Scaling the clock
instead leaves the schedule exactly as attested. The clean, param-free URL is the slowest one, which
is the point — this is a look call, biased toward legible over brisk, and it is the owner's to move.

**Speed scales the CLOCK, never the schedule.** Every island's `start`/`end` is a fraction of the
plan, so a rate multiplier on elapsed time leaves the whole arrangement proportionally identical.
ADR-0285's causal invariant — an island forms where a pathway reaches it — holds at every speed.

### D5 — the plan is keyed on the GRAPH, not on the arrays it arrived in

Not an owner fork; a consequence of D2 that had to be settled to make it work at all. The studio
paints from a cached tree payload and then confirms it against `/api/tree` (ADR-0240), so the same
graph arrives twice as two different arrays seconds apart, and the second one used to rebuild the
plan and reset the cursor. Behind `?act2=intro` that was invisible — the owner had not started a run
yet. On automatic arrival it would have killed the intro mid-flight every single time the confirm
landed. The plan is now held by a content signature of exactly what `deriveForestRegrowPlan` reads.

## Measured

Production build (`pnpm --filter studio build`), real corpus (45 stories → 40 mapped islands, 20,844
settled SVG nodes), Playwright/Chromium at 1600×1000. Every run is bracketed by an idle-floor probe
BEFORE and AFTER — a pre-run probe alone proves the box was quiet before the run, not during it, and
a run that meets contention is stretched by the player's own 500 ms per-frame clamp rather than
slowed, which reports machine load as if it were the dial. Runs whose either floor was not ~16.7 ms
were discarded, not interpreted. "Painting" is the live `[data-island-accretion-cell]` count, never
an element-count delta.

**The ghost hexes (D1).** 952 coast hexes on the settled map. At the first frame of a run: **0**.
Across the first 15% of the run: **0–19**. Reproduced in every run taken, including the discarded
ones — it is a structural claim, not a timing one.

**Pace (D4).** 1× → **6.8 s** against increment 2's 7.0 s: the schedule is unchanged, which is the
point of scaling the clock. 0.6× → **12.9 s / 11.6 s**.

**Pace at the amended default (D4, 2026-08-03).** 0.25× → **30.2 s / 29.6 s** on two clean runs, and
**23.4 s** for the auto-play on first arrival (which starts as soon as the scene exists rather than
after a settle, so it is the shorter and more representative number — it is what a visitor actually
waits through). Same bracketed protocol, opening and closing idle floors both 16.7 ms. Re-measured on
the day's corpus, which had grown to 968 coast hexes; the ghost-hex claim held unchanged at **0** on
the first frame.

**Frame cost.** Painting frames, p50 by nodes then on the map, against increment 2's baseline:

| nodes | baseline | 1× | 0.6× |
| --- | --- | --- | --- |
| 0–4k | 16.7 ms | 16.7 | 16.7 |
| 4–8k | 16.8 ms | 66.7 | 33.3 / 50 |
| 8–12k | 48.2 ms | 66.7 | 50 / 66.7 |
| 12–20k | — | 133 / 150 | 100 / 183 |
| 20k+ (full forest) | 391.6 ms | 150 / 167 | 117 / 217 |

**Read the middle rows with care — they are not comparable across this change.** Hiding ~950 coast
paths until their island lands alters how many nodes are on the map at any given moment, so a frame
that now falls in "4–8k" is one that previously sat a bucket higher. The two comparisons that ARE
sound are the endpoints: the settled node count is identical (20,844 ≈ the baseline's 20.8k), and
the full-forest frame is **150–217 ms against 391.6 ms**. No frame-cost work was done here — that is
ADR-0283 D3 and still open — so this is a side effect of the coast arriving late, not an
optimisation, and it is reported as evidence of no regression rather than as a win.

## Consequences

**Good.**

- The forest genuinely starts from nothing. Nothing on the map states an island's existence, extent
  or position before a pathway reaches it — the coast was the last thing that did.
- The introduction is reachable by arriving, which is what an introduction is for, and costs a
  returning viewer in the same session nothing at all.
- Pace is now the owner's dial rather than a constant in a tuning table, and moving it cannot
  disturb the attested schedule.
- The gear grows an action slot, which is a genuinely missing shape — it had no way to offer
  anything that was not a URL value.

**Costs and risks.**

- ADR-0282 D6's byte-identical clean route is gone (D2). Deliberate, amended, stated.
- A first arrival now pays for the plan and one accretion walk per island. Second and later
  arrivals in the session pay neither.
- A regrow default that is not 1× will read as arbitrary to someone who finds the dial before this
  ADR. The hint under the control states what 1× means and why the default is lower.
- A coast hex shared between two close islands appears with the FIRST of them. Honest — it did grow
  out of that island's land — but it means a settled island can carry a sliver of moat that also
  hugs a neighbour that has not formed yet.
- The frame-cost floor is untouched (ADR-0283 D3). A slower run spends longer on the map, so the
  heavy final third is on screen for longer; hiding the coast until an island lands cuts the early
  frames' DOM rather than the late ones'.

## References

- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — the Act 2 intro
  architecture. D6's byte-identical clean-route promise is amended by D2 here; the rest stands.
- [ADR-0283](0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md) — edge-driven
  growth, and D2's retirement of the Layout gear section this one moves into.
- [ADR-0285](0285-an-island-forms-the-moment-a-pathway-reaches-it-not-when-all.md) — the causal
  invariant D4's speed dial must not disturb, and the reason the run got fast enough to complain about.
- [ADR-0240](0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md) — D2's map-payload
  cache, the cached-then-confirmed paint D5 exists to survive.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the owner holds
  the LOOK verdict; every item here came from the owner watching a build.
- `packages/forest-world/src/scene.ts` — `SceneEmptyHex`, the attributed coast.
- `packages/app-surface/src/SceneView.tsx` / `forest-regrow-render.ts` — `hiddenEmptyStoryIds`.
- `apps/studio/src/components/act2Intro.ts` — the session flag, the speed dial, the graph key.
- `apps/studio/src/lib/worldSettings.ts` — the `regrowSpeed` dial and the Forest intro group.
- Arc `act2-intro-forest-regrow-arc` — this initiative.
