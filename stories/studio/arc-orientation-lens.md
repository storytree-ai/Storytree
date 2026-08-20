---
id: "arc-orientation-lens"
tier: capability
story: studio
title: "The arc lens — an owner arriving cold is oriented from the map's top drawer alone"
outcome: "An owner arriving cold is oriented by the map's arc lens alone, without asking an agent to reconstruct the context."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [267, 314, 316, 305, 239]
# A greenfield capability registered retrospectively by capability-layer-coverage-arc increment 4
# (2026-08-07). It resolves FOUR story-grain
# `repo-manifest.json` declarations that existed only because no capability covered this organ.
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm:
#   1. This classification correction does not add a `real:` arm or manufacture a red/verdict
#      (ADR-0159). A `real:` arm would also move the pinned
#      REAL-buildable snapshot in `packages/cli/src/node-build.test.ts`.
#   2. `readUnitSourceFiles` (packages/cli/src/check-boundaries.ts:210-234) reads ONLY
#      `real.sourceFile` + literal `real.scope.sourceGlobs` and `continue`s on an absent `real`
#      (`:226`), so this unit contributes nothing to `unitSourceFiles` and the ADR-0192 landlord
#      rule does not fire over it. All four files are in `apps/studio`, this story's OWN building,
#      so nothing here would need a `hostedStories` entry even if one were added later.
# The command is the studio's vitest suite — apps/studio is VITEST + jsdom, not node:test.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/src/components/ArcSurface.test.tsx"
      - "apps/studio/src/components/FloorHealthLamp.test.tsx"
      - "apps/studio/src/lib/arcSurface.test.ts"
      - "apps/studio/src/lib/arcRollups.test.ts"
      - "apps/studio/src/lib/floorHealth.test.ts"
    sourceGlobs:
      - "apps/studio/src/components/ArcSurface.tsx"
      - "apps/studio/src/components/FloorHealthLamp.tsx"
      - "apps/studio/src/lib/arcSurface.ts"
      - "apps/studio/src/lib/arcRollups.ts"
      - "apps/studio/src/lib/floorHealth.ts"
---

# The arc lens — an owner arriving cold is oriented from the map's top drawer alone

**Outcome —** An owner arriving cold is oriented by the map's arc lens alone, without asking an
agent to reconstruct the context.

**Depends on —** nothing within this story. The three modules this organ's code reaches outside
itself are `src/api.ts`, `src/lib/poll.ts` and `src/types.ts` — story-grain infrastructure that no
capability owns — plus `src/lib/route.ts`'s `assetHref` for the deep link. Neighbouring another
capability's code in `TreeView.tsx` is not an edge; this unit consumes nothing any named `studio`
capability produces, the same same-file-adjacency-is-not-an-edge call `coalesced-camera-pan`,
`map-payload-cache`, `map-server-memo` and `map-boot-independence` each already record in
[`story.md`](story.md). It is a root.

> **Proof status (honest) — `proposed` (greenfield without a current signed pass; NOT `healthy`).**
> The surface landed through ordinary sessions (#1186, #1191, #1195) and its tests were written
> alongside it. That history is greenfield; neither late registration nor the absence of a gate-driven
> red→green makes it brownfield or Adopt-bound (ADR-0395).
>
> **The outcome half — `apps/studio/src/components/ArcSurface.test.tsx`, 19 tests.** A jsdom render
> of the REAL `ArcSurface` over real `ArcRollup[]` props, holding the lens to ADR-0314 decision by
> decision (D1/D2/D3/D4/D7/D9) plus the four-answer absence contract. No stub sits between the
> in-story collaborators: the component under test imports the real derivation (`lib/arcSurface.ts`),
> the real state vocabulary (`lib/arcRollups.ts`) and the real derivation, and exercises them through
> one render. That is the integration proof.
>
> Since ADR-0349 the floor-health reading is NOT part of that render — it moved out of this lens to
> the map (`FloorHealthLamp.tsx`, mounted by `TreeView`), and what `ArcSurface.test.tsx` now asserts
> about it is its ABSENCE: no band, no `factory floor` text, and no prop to re-mount it through.
>
> **The leaf half — further tests** across `arcSurface.test.ts` (24), `FloorHealthLamp.test.tsx`
> (17), `floorHealth.test.ts` (15) and `arcRollups.test.ts` (9). These are the contracts below.
>
> **The stated gap — the DATA layer is proven, but never against the real route.**
> `arcRollups.test.ts` drives `useArcRollups` with a stubbed `api.arcs()`, `floorHealth.test.ts`
> drives `useFloorHealth` with a stubbed `api.floorHealth()`, and `ArcSurface.test.tsx` takes its
> props already-shaped and declares its own fence in its header (*"No backend seam (no `api`, no
> fetch, no socket, no DB)"*). So nothing in this capability's scope ever calls `GET /api/arcs` or
> `GET /api/floor-health` for real. Both routes' own payloads ARE covered, and by suites OUTSIDE this
> capability: `/api/arcs` by [`mirrored-route-conformance`](../desktop/mirrored-route-conformance.md),
> whose registry row replays the real dispatcher over fixture arc stores, and `/api/floor-health` by
> `apps/studio/server/floorHealthApi.integration.test.ts`, which drives the real handler over a real
> `node:http` server. Neither proves that THIS lens reads what they serve. The seam between the two
> halves is asserted nowhere. Recorded here, not implied.
>
> **A second gap, smaller and named rather than folded in.** `useArcRollups`'s poll is driven
> through fake timers against a stubbed client, so the REAL cadence constant it imports
> (`SLOW_POLL_MS`) is exercised only as a number, never as a live interval. The drawer-scoping
> claim — that a closed lens costs nothing — is proven at the hook, not at the mount in
> `TreeView.tsx:1732`.
>
> **No reliability gate `(covers:)` this capability.** The story's `studio#gate-1` names the
> Playwright story UAT, which does not open the arcs lens. Extending an already-signed gate's
> `(covers:)` list changes what a signed verdict claims, so it is a deliberate, id-aware edit for
> the owner — a stated gap, not a hidden one.

## Guidance

**WHY THIS IS ONE ORGAN AND NOT TWO OR FOUR** (the splitting-rule, ADR-0010). The tempting cut is
by layer — a data hook, a pure derivation, a component, a strip — which is exactly how the four
`repo-manifest.json` declarations that preceded this file were shaped. It is the wrong cut:

- **Three of the four could not state a proof alone.** `lib/arcSurface.ts` is pure derivation with
  exactly one consumer; delete `ArcSurface.tsx` and it is dead code with a test. `lib/arcRollups.ts`
  is a hook whose four states exist only because the component renders four different answers — the
  component imports its `ARCS_UNREACHABLE` and `ArcRollupsState` by name. Under the arc's own rule
  that a capability which cannot state its proof must not be authored, a per-layer split does not
  produce four weak capabilities; it produces one capability and three units that are illegal to
  author.
- **Both triggers of the splitting-rule pass for the fused unit.** Its outcome states in one
  sentence without a conjunction (above), and its proof shares one precondition (one already-joined
  `ArcRollup[]`) and one observable (the rendered lens).
- **The dependency runs one way and the graph stays acyclic.** `arcRollups` → `arcSurface` →
  `ArcSurface` is a single chain with no back-edge; nothing upstream needs anything the downstream
  delivers. `lib/floorHealth.ts` and `FloorHealthLamp.tsx` form a SECOND, parallel chain on the same
  rung — a poll plus a mapping plus the instrument that renders it. Its one `import type` from
  `FloorHealthLamp.tsx` is deliberate rather than a cycle — the volume fence is a TYPE with nowhere
  to put a filing count, so it belongs where its justification is written, and a type-only edge
  carries nothing at runtime.

  **⚠ SINCE ADR-0349 THE TWO CHAINS NO LONGER MEET, AND THAT IS A STANDING QUESTION FOR
  `story-author` RATHER THAN SOMETHING THIS FILE SHOULD SETTLE QUIETLY.** The floor-health chain's
  consumer used to be `ArcSurface.tsx`, which is what put it inside this organ; it is now `TreeView`,
  and the reading is drawn on the map rather than in this lens. The competence argument below still
  reaches it — the lens's competence is ORIENTATION, and *whether the factory itself is in trouble*
  is one of the four things an owner arriving cold needs — so it is kept here rather than orphaned to
  a story-grain declaration. But the ONE-CONSUMER fact that made the call obvious is gone, and the
  honest position is that this is now a judgement, not a derivation. Recorded, not hidden.

**WHY THE OUTCOME IS "ORIENTED" AND NOT "READS EVERY ARC'S STANDING", AND WHY THAT IS WHAT LETS THE
STRIP BE IN THE ORGAN.** This is the one live fork in authoring this unit, so it is recorded rather
than settled silently.

`FloorHealthLamp` answers a DIFFERENT question from the lanes, and says so in its own header: *"It
is deliberately NOT an arc state — every per-arc state answers what is the state of THIS arc, and
none answers is the floor healthy."* An outcome written as *"reads every live arc's standing"*
therefore does not reach the lamp, and bolting it on with an `and` trips the splitting-rule's first
trigger outright.

That difference is exactly what ADR-0349 acted on: a reading that is not an arc state was being drawn
as the first row of the arc lens, where it read as that surface's TITLE and over-claimed itself.

The resolution is that **the lens's competence is ORIENTATION, not arc-reporting** — which is not a
convenient re-wording but what the surface was chartered as: ADR-0267 D1 makes it *the map's primary
top-drawer lens*, and the arc that authored it is named `arc-orientation-surface-arc`. An owner
arriving cold needs four things and the lens supplies all four in one place: which initiatives are
live, where each stands, what is waiting on them, and whether the factory itself is in trouble. The
strip is the fourth. Under that outcome it is INSIDE the organ, and three independent facts agree:

1. ~~**Its only consumer is `ArcSurface.tsx`**~~ — **OVERTAKEN BY ADR-0349.** Its consumer is now
   `TreeView`, which mounts `FloorHealthLamp` on the map beside the world gear. This fact no longer
   supports the call; the competence argument above is what carries it, and the ⚠ note in the
   splitting-rule section records that the call is now a judgement.
2. **ADR-0316 D5 assigns it here explicitly** — it *"amends"* ADR-0314 and keeps *"its D7
   factory-floor health strip … that surface's to build"*, moving only the INSTRUMENT away. ADR-0349
   amends the PLACEMENT and leaves that ownership untouched: the reading is still this story's to
   draw, and still not this story's to measure.
3. **The proof covers it** — `FloorHealthLamp.test.tsx` holds every refusal the strip's suite held,
   and `ArcSurface.test.tsx` now asserts the reading's ABSENCE from the lens (no band, no prop),
   which is the fence against a later session re-mounting it where ADR-0349 removed it from.

**NO NODE IS AUTHORED FOR THE INSTRUMENT, AND THE FIGURE IS NOW WIRED TO IT.** ADR-0316 D1–D4 moved
the MEASUREMENT to `factory-floor-health-arc`, and it landed there in #1215 as `storytree factory
health`. This organ consumes it and computes none of it: `GET /api/floor-health` serves drive's
`loadFloorHealthReading` — the same composition the CLI prints under "THE READING" — and
`lib/floorHealth.ts` polls it and maps it to what the strip may hold. What this unit owns on top of
the reading is exactly two things, and both are rendering calls rather than measurement:

- **The loud/quiet THRESHOLD** (`LOUD_AT_RECURRENCES` in `FloorHealthLamp.tsx`), which ADR-0314 D7
  left unstated and ADR-0316 D4 deliberately kept out of the instrument — *the band that reads the
  figure decides*. It is 2, and the constant carries its reasoning: at ≥1 the band was loud on its
  first day and permanently, because the loudest live cause on 2026-08-08 had recurred exactly once.
- **What a DECLINE looks like.** ADR-0316 D2's refusal is the instrument's; honouring it is the
  band's. A pending read and a stated decline each get their own state, and neither falls back to
  `quiet` — reporting a healthy floor on the strength of not having looked is the one reading this
  band must never produce.

Contracts 8 and 10 below are what keep both honest, and contract 8 still fences the volume rule that
survived the wiring unchanged: the signal shape has nowhere to put a filing, session or report count,
and the mapping drops the reading's own population figures (`distinctCauses`, `unjoined`, `members`)
rather than passing them through.

**WHY THIS IS A `studio` CAPABILITY, and the two rejected homes.**

1. **All four files are in `apps/studio/src`, this story's own building** — no landlord question
   arises, and no `hostedStories` entry is needed.
2. **The journey is this story's.** [`story.md`](story.md)'s outcome is *"An operator reviews the
   project record through one browsable forum studio"*; the arc lens is the drawer they review the
   record's initiatives through.
3. **`desktop` — checked, because it serves the SAME compiled studio bundle (ADR-0090 d.4) and its
   local backend mirrors `/api/arcs`.** It is not the home. What the desktop owns is that its
   hand-written copy of the PAYLOAD matches the studio's, and that is already a capability —
   [`mirrored-route-conformance`](../desktop/mirrored-route-conformance.md), whose `/api/arcs`
   registry row exists precisely because this hook's first landing (#1191) sat on a permanent
   spinner against a 404ing desktop backend. The lens itself is drawn by studio code and proven by
   the studio suite; the mirror is the desktop's obligation. Two different outcomes, cleanly split.
4. **`library-tech-tree-overlay` — checked, because the lens lives in the same drawer as the Library
   lens and imports `lib/route.ts`'s `assetHref` (a module that story owns).** It is not the home:
   the import is a deep-link helper, a call site rather than a shared competence, and that story's
   journey is browsing the corpus. The arc lens browses no corpus — it reads a rollup off one route.

**THE PROOF COMMAND.** `pnpm --filter studio test`. `apps/studio` is VITEST + jsdom
(`apps/studio/vitest.config.ts`), not `node:test`, so the default runner cannot execute the two
`.test.tsx` files this organ turns on. The command matches the two sibling retrospectively registered capabilities
authored on this arc and the studio's other spec-borne units. The scope globs are each
repo-relative, rooted at `apps/`, and name one concrete file, so they are inside the ADR-0087
structural bound (`scopeGlobBoundIssue`, `check-boundaries.ts:243-264`).

## Integration test

**Goal —** Prove that an owner opening the map's arc drawer is oriented from that surface alone:
every live initiative is drawn with its state and its unit bars, the briefing panel opens where they
are needed and links through to the artifact holding the question, the floor-health band is present,
and no non-answer from the backend is ever rendered as a confident empty one.

The integration-flavoured proof is `apps/studio/src/components/ArcSurface.test.tsx`, run by
`pnpm --filter studio test`. Real collaborators, no stub between them: the render pulls in the real
`arcLanes` / `arcBriefing` / `briefingLead` / `defaultLaneId` derivation, the real
`ARCS_UNREACHABLE` vocabulary, and asserts against the rendered DOM
rather than against the derivation's return values. `now` is injected, so every recency judgement in
the run is reproducible rather than dependent on when the suite ran.

Six groups, one per decision the surface is held to: lanes with no date axis (D1); unit bars, counts
and the absent percentage (D2); the briefing panel's waiting-first ordering and its `#/asset/<id>`
click-through (D3); `blocked` named and left unlit with its reason visible (D4); the floor-health
strip present and above the lanes (D7); and read-only — no comment box, no answer field, no write
affordance (D9). The seventh group is the honest-absence contract, which is four facts rather than
two: still-loading, read-never-answered, store-absent and store-empty each render differently.

The authored rung remains `proposed` until current signed proof exists. The `GET /api/arcs` seam and the live
poll cadence are exercised nowhere in this scope — the stated gaps recorded above, not claimed here.

## Contracts (10)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`bars-are-units-and-carry-no-date-meaning`** — the whole of ADR-0314 D2's model
   - **asserts —** one bar per increment, green for the single landed status (`closed`) and grey for
     everything else; the landed run and the queued run stay visibly apart with landed first
     (ADR-0305 D7), so an unbuilt intention can never be taken for something that happened; and an
     UNRECOGNISED status is grey rather than landed, because an unknown row is not a landing.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:44-54`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:64`, `:84`, `:95` (REAL, passing)
2. **`counts-never-a-ratio`** — the missing percentage is the point, and it is fenced structurally
   - **asserts —** landed and queued are reported as counts, and the returned shape exposes NO
     percentage, ratio or denominator field at all. An arc has no denominator — its `endState` is
     prose rather than a checklist — so a progress bar would assert something the data cannot
     support, and the test fences the shape so nothing can quietly add one.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:65-78`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:102`, `:110` (REAL, passing)
3. **`a-parking-is-activity-and-a-bad-date-is-not-epoch-zero`** — what "last active" counts
   - **asserts —** the latest moment is the max over every landing date AND every parking stamp, so
     an arc that gained parked entries yesterday does not read as untouched; a parking counts even
     with no landing after it; the result is `null` with no dated increment; and an unparseable date
     is SKIPPED rather than read as epoch 0, so one malformed row cannot drag a live arc to `quiet`.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:145-158`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:126`, `:134`, `:141` (REAL, passing)
4. **`blocked-is-never-derived-and-the-three-substitutes-are-rejected-by-name`** — the refusal is a
   testable fact, not a comment nobody reads
   - **asserts —** an authored open question makes an arc `waiting` and that wins over any recency
     judgement AND over `claimed`; recent activity reads `moving` (RENAMED from `running` by
     ADR-0351 — the word promised a live session the predicate never measured, and at 2026-08-12
     velocity it lit every lane, so it was both false and non-discriminating) and older than the
     window reads `quiet`; a live claim that provably resolves to the arc reads `claimed`, the one
     ledger-backed state; and NO
     input of any shape produces `blocked` — an arc that never landed anything (B2), an arc carrying
     a `proposed` ADR (B1), and an arc gone quiet past the window (B3) are each rejected BY NAME.
     Those three answer *has this arc been quiet*, which is a symptom rather than a cause; at
     2026-08-05 density B3 alone lit 8 arcs and collapsed `blocked` and `quiet` into near-synonyms.
     A `blocked` that conflated "nobody has touched this" with "this cannot proceed" would train the
     owner to ignore it.
   - **covers —** `apps/studio/src/lib/arcSurface.ts` (`arcState`, `arcClaimants`,
     `BLOCKED_IS_DERIVABLE`)
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts` — the `arcState` and `arcClaimants`
     groups (REAL, passing)
5b. **`claimed-is-asserted-positively-and-never-negatively`** — the one ledger-backed lane state, and
     the asymmetry that lets a partial-coverage join be honest (ADR-0351 D2)
   - **asserts —** a live claim matching the arc id, one of its own increment ids, or a unit an
     increment `cites` (scheme stripped) lights `claimed`, which outranks the recency states but
     never `waiting`; a claim matching NOTHING falls through to recency rather than producing any
     "unclaimed" state, and `null` (no live store) is the SAME not-proven answer as a genuine
     no-match, because neither can support a negative; sessions are deduped, so one session on three
     of an arc's units is one session on the arc; and a shared id PREFIX never matches — a
     `startsWith` rule was tried and removed, because it silently absorbed any unit whose id began
     with the arc's and reported a session onto an arc it had never touched, and a false positive
     corrupts the only thing a positive-only signal asserts.
   - **why it is positive-only —** measured, not cautious: `cites` carries a `capability:` ref on 5
     of 613 live increments (0.8%), an arc cannot be a `cites` target at all, and only ~4.9% of hold
     spans name an arc id. A claim-DERIVED replacement for the recency states would report "nothing
     claimed" on nearly every arc while a session sat on one.
   - **covers —** `apps/studio/src/lib/arcSurface.ts` (`arcClaimants`)
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts` (the `arcClaimants` group) +
     `apps/studio/src/components/ArcSurface.test.tsx` (the ADR-0351 group) (REAL, passing)
5. **`lanes-are-active-only-waiting-first-and-totally-ordered`** — the scan order is the D3 posture
   - **asserts —** closed arcs are dropped (ADR-0239 D3's active-only default — 27 finished
     initiatives above the 20 live ones would bury the answer); lanes order waiting > running >
     quiet with the most recently active first inside a state; each lane carries its own bars,
     counts and state; and ties break by id so the order is TOTAL and a render is stable between
     polls rather than reshuffling under the reader.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:187-223`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:207`, `:226`, `:233` (REAL, passing)
6. **`the-panel-opens-where-the-owner-is-needed`** — the default is testable rather than an accident
     of render order
   - **asserts —** `defaultLaneId` opens on the first waiting lane when one exists, falls back to
     the first lane otherwise, and is `null` with no lanes at all.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:230-233`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:246`, `:257` (REAL, passing)
7. **`the-briefing-splits-three-ways-without-mutating-its-source`** — what the panel shows, and the
     lead it shows it in
   - **asserts —** the payload splits waiting / next / landed with LANDED NEWEST FIRST (where it is
     up to reads backwards from now) while `next` keeps the rollup's own longest-waiting-first
     order; the rollup it reads is not mutated; `briefingLead` strips paired `**`/`__`/backticks and
     collapses whitespace so store markdown does not show through as literal asterisks; single `*`
     and `_` are LEFT ALONE because they appear inside ids and file paths far more often than they
     mean italics, and mangling an id in a briefing is worse than one stray character; and an arc
     with nothing waiting still briefs.
   - **covers —** `apps/studio/src/lib/arcSurface.ts:273-290`
   - **proven by —** `apps/studio/src/lib/arcSurface.test.ts:265`, `:282`, `:288`, `:298`, `:304`
     (REAL, passing)
8. **`the-floor-band-shows-no-figure-it-does-not-have`** — the volume count that must never stand
     in for a reading, and the two states that must never read as calm
   - **asserts —** the signal shape carries NO filing / session / report / total field at all, so a
     hundred reports of one bottleneck can never score like a hundred reports of a hundred; with no
     signal the band renders `unwired` showing no figure whatsoever; a read still in flight reads
     `reading` and a stated DECLINE reads `declined` naming the condition that stopped it — neither
     collapses into `quiet`, because a healthy floor reported on the strength of not having looked is
     the one answer this band must never give (ADR-0316 D2 carried to the renderer); a reading with
     no recurring bottleneck reads `quiet` with its window attached; a reading past the threshold
     goes `loud`, naming each qualifying cause and its recurrences SINCE ROUTING, deep-linking each
     into its Library artifact, and printing the collapsing rule beside the figure (ADR-0316 D3 — a
     distinctness count whose rule is hidden is just a different unaudited number); and the band
     offers no affordance to discharge, route or dismiss, because ADR-0316 D4 keeps adjudication with
     the graduation-synthesist and a dismiss button would be adjudicating.
     Two of these assertions CHANGED SHAPE when ADR-0349 turned the always-open band into a
     disclosure, and neither rule was weakened — both are called out in the suite where they appear.
     The read-only fence stopped being "no buttons at all" (a sound proxy for always-open prose, but
     a lamp necessarily owns the one button that opens its own provenance) and became the direct
     statement: the ONLY control is the disclosure, and nothing offers to dismiss, discharge,
     acknowledge, snooze or mute. And the withheld sub-threshold figure stopped being printed inline
     — it is now carried two ways, by a pip row that draws the threshold and how far the loudest
     cause climbed WITHOUT a click, and by the figure itself one disclosure away.
   - **covers —** `apps/studio/src/components/FloorHealthLamp.tsx` (`FloorHealthLamp`,
     `floorLampState`, its band types and `LOUD_AT_RECURRENCES`)
   - **proven by —** `apps/studio/src/components/FloorHealthLamp.test.tsx` (17 tests, REAL, passing)
9. **`four-answers-four-different-facts-and-a-blip-is-not-one-of-them`** — the #1191 regression, and
     the distinction the endpoint itself insists on
   - **asserts —** the hook fetches nothing while closed and fetches IMMEDIATELY the instant it
     opens rather than waiting out the interval, re-polls on the shared slow cadence while open and
     stops the instant it closes (a drawer-scoped lens adds no always-on cost class); `null` (the
     backend has no document store) passes through and stays distinct from `[]` (a store with no
     arcs), because *no store* is not *no arcs*; a read that fails with nothing yet known reports
     `unreachable` and STAYS there across repeated failures rather than flapping back to loading —
     the regression that left the desktop's arc lens on a permanent "Reading arcs…" spinner, which
     is a worse lie than an empty list because it tells the owner to wait for something that is not
     coming; a later successful poll recovers; and once anything is known, a later failure keeps the
     last-known value, including a known `null`, which is knowledge rather than the absence of it.
   - **covers —** `apps/studio/src/lib/arcRollups.ts:53-78`
   - **proven by —** `apps/studio/src/lib/arcRollups.test.ts:62`, `:74`, `:90`, `:98`, `:105`,
     `:115`, `:123`, `:135`, `:146` (REAL, passing)
10. **`the-floor-reading-crosses-the-wire-without-its-population-counts`** — the mapping, the two
      delays, and the guard that stops one open lens from scanning the corpus twice
    - **asserts —** the reading becomes a signal carrying the loudest cause de-slugged into the
      owner's language, its recurrence, the window (both bounds open ⇒ "all history → now") and the
      collapsing rule — and NOTHING ELSE: `distinctCauses`, `unjoined` and `members` are DROPPED, all
      three being counts over a population rather than one cause coming back, and the last of them a
      filing count wearing a collapse label. Each of the four wire answers maps to its own band arm
      and none of them maps to a reading with zero bottlenecks, which is what "the floor is fine"
      looks like. The hook fetches nothing while the lens is closed, fetches immediately on open,
      and then runs TWO delays off one timer: a success is left alone for the long cadence (the read
      scans the whole friction tier and event log for a figure that moves on a daily grain) while a
      FAILURE comes back on the short one, so a cold-start blip is not five minutes of "no reading".
      A failure with nothing yet known reports `unreachable`; once anything is known a later failure
      keeps it. And a second effect invocation while a read is in flight fires NO second read — the
      StrictMode double-invoke, measured against the live route as two contending whole-corpus scans
      whose first response landed against a torn-down closure while the second aborted.
    - **covers —** `apps/studio/src/lib/floorHealth.ts`
    - **proven by —** `apps/studio/src/lib/floorHealth.test.ts:51`, `:68`, `:81`, `:87`, `:97`,
      `:101`, `:109`, `:114`, `:139`, `:146`, `:161`, `:171`, `:181`, `:204`, `:212` (REAL, passing)
