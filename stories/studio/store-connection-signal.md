---
id: "store-connection-signal"
tier: capability
story: studio
arc: map-freshness-arc
title: "The map says whether the database is connected"
outcome: "An operator reading the forest map can see at a glance whether the live store is connected, without opening anything."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [448, 445]
# GREENFIELD. The `proof:` block is spec-borne (ADR-0057) and there is deliberately NO `real:` arm,
# for the reason `arc-orientation-lens` states next door: a `real:` arm would move the pinned
# REAL-buildable snapshot in `packages/cli/src/node-build.test.ts`, and `readUnitSourceFiles`
# (packages/cli/src/check-boundaries.ts) reads ONLY `real.sourceFile` + `real.scope.sourceGlobs`, so
# with no `real` arm this unit contributes nothing to `unitSourceFiles` and the ADR-0192 landlord
# rule does not fire over it. Every file below is in `apps/studio`, this story's OWN building.
# The command is the studio's vitest suite — apps/studio is VITEST + jsdom, not node:test.
#
# THIS UNIT REPLACES `map-currency-signal`, WHICH LANDED IN PR #1636 AND WAS NARROWED BY THE OWNER
# THE SAME DAY (ADR-0448). The wider signal it replaces answered "is what I am seeing current?"; this
# one answers only "is the database connected?". The rename is in place rather than a retire-and-add
# because nothing had yet been signed against the old id and its own journey no longer exists.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/src/lib/storeConnection.test.ts"
      - "apps/studio/src/components/StoreConnectionChip.test.tsx"
      - "apps/studio/src/App.store-connection.test.tsx"
    sourceGlobs:
      - "apps/studio/src/lib/storeConnection.ts"
      - "apps/studio/src/components/StoreConnectionChip.tsx"
      - "apps/studio/src/App.tsx"
      - "apps/studio/src/components/TreeView.tsx"
---

# The map says whether the database is connected

**Outcome —** An operator reading the forest map can see at a glance whether the live store is
connected, without opening anything.

## Why this is one capability

The journey is one glance and nothing else: the operator looks at the top-left of the map and knows
whether the database is answering. There is no second step, because a signal that needs a second
step has failed at the only thing it is for.

The three states, their two-word texts and the placement are one unit because they are one glance.
Splitting the placement out would leave a light nobody's eye reaches; splitting the wording out
would leave a light that needs explaining, which is the failure the owner named directly.

## What this REPLACES, and the cost that was accepted knowingly

This unit is the narrowed successor to `map-currency-signal` (PR #1636), which shipped the same day
answering the wider question *"is what I am seeing current?"* — green for live data AND current
code, amber for a cached paint or an app behind `main`. The owner reviewed it and narrowed it to the
database connection alone, with the cost stated to him plainly and chosen (ADR-0448).

**The cost, recorded here so nobody rediscovers it as a bug: this light shows GREEN through the
2026-08-25 incident that started the arc.** That incident was a version skew, not a connection
failure. The map JOINS signed verdicts (live from the store, always current) against the story shape
read from `stories/**` on the app's OWN DISK, frozen at the commit the app was built from; verdicts
bind to criteria by `criterionId` + `revisionId` (ADR-0253), so an app at an older commit reads the
database perfectly and still paints yellow. The connection was fine the whole time. This instrument
does not see that class of fault and is not meant to. **Widening it back out is a decision, not a
fix** — the standing disclosure for the skew is the store banner's *"a newer version has landed …
the forest may be under-claiming"* message, and the structural closure is ADR-0445 D1's migration.

## Guidance

- **Three states, each two words, and the words are the whole message.**
  - **green** — `connected`: the store answered.
  - **amber** — `connecting…`: a start is in flight and we are waiting on it.
  - **red** — `not connected`: it did not answer.
  If a state cannot be said in two words, change the state, not the surface.
- **No hover, no click, no control.** The owner's instruction was that it should need no
  explanation, and that is a constraint on the design rather than a corner cut. Recovery — Start DB,
  Wake, restart — belongs to the store banner, which owns the `/api/health` poller and the recovery
  UX; a control here would be a second, competing path over one signal.
- **A reachable store behind stale server code is GREEN.** That is the narrowing in one line: the
  store answered, so the connection is fine. That the server is running older code is a real problem
  and a different one, and the banner already reports it.
- **A reading that has not been taken is not a green, and neither is "no database".** Before the
  first health probe the phase is unknown, and on the offline JSON store there is no database in
  play at all. Both render NOTHING rather than a fourth state — claiming `connected` before looking
  would be a claim made without looking, and flashing `not connected` on every boot would cry wolf.
  The offline store already announces itself with its own badge.
- **Every phase must be mapped, by name.** The one way this light goes quietly wrong is a phase
  nobody mapped falling through to something that reads as fine, so the mapping is exhaustive over
  the store-health phase vocabulary and the test drives every arm of it.
- **Ride the poll that exists; do not add one.** `StoreBanner` already owns the single `/api/health`
  poller and already lifts its resolved phase to `App` for the load screens. This is a SECOND READER
  of that one phase. Adding a poller instead of reading the lifted phase is the wrong fix and is
  refused.
- **Placement: the top of the map's left-hand column, above the Legend drawer** — the owner's call.
  It sits OUTSIDE that panel's scrolling half, so a long island list can never scroll the light out
  of view.
- **Keep the implementation boundary small.** ONE pure client module,
  `apps/studio/src/lib/storeConnection.ts` (no React, no `fetch`, no clock), plus ONE presentational
  component, `apps/studio/src/components/StoreConnectionChip.tsx`. The wiring points are `App.tsx`
  (passing the already-lifted phase down) and `TreeView.tsx` (the mount).
- **Change no server code.** No new route, field, header or probe. Every input is already on the wire.
- **Prove it as an integration test.** Vitest; the pure mapping directly, the render under jsdom, and
  the wiring against the REAL App + TreeView + StoreBanner. Test titles carry every contract id
  below, each as ONE plain string literal with the declared id leading it — never a concatenation and
  never a locally-invented id, because the coverage scan is a static AST scan (ADR-0126).

## Integration test

1. Drive the reading with a healthy store phase. Assert green and the word `connected`.
2. Drive it with a reachable store behind stale server code. Assert green — the narrowing, asserted
   rather than left to prose.
3. Drive it with each not-answering phase (stopped, unreachable, the studio server itself lost).
   Assert red and the word `not connected` for each.
4. Drive it with a pending start. Assert amber and the word `connecting…`.
5. Drive it with the pre-probe phase and with the offline JSON store. Assert no reading in both, and
   assert the component renders nothing for it.
6. Drive EVERY phase in the vocabulary and assert each resolves to a reading or an explicit absence —
   none falls through to `undefined`, which would render as no chip while actually meaning nobody
   decided.
7. Render each state and assert it is exposed as a stable marker with its two words on the face, that
   the chip holds no button, link, or hover text anywhere, and that no state's text exceeds two words.
8. Boot the REAL App with the REAL `TreeView` and `StoreBanner`, with `/api/health` answering, then
   with it unreachable and the instance reported stopped. Assert the live map paints green and then
   red — the isolated tests above cannot fail if the chip is never mounted or the phase never reaches
   it. On the same boot assert the chip is the FIRST child of the map's left-hand panel (above the
   Legend drawer) and is NOT inside that panel's scrolling half.

## Contracts

1. **`store-connection-signal-greens-only-when-the-store-answers`**
   - **asserts —** a healthy probe reads green and says `connected`; a reachable store behind stale
     server code is also green; no other phase is; and the live map paints green end to end.
2. **`store-connection-signal-reds-when-it-does-not`**
   - **asserts —** a stopped, unreachable, or lost store reads red and says `not connected`, and the
     live map paints red end to end against a stopped instance.
3. **`store-connection-signal-ambers-while-a-start-is-in-flight`**
   - **asserts —** a pending start reads amber and says `connecting…` — the wait, not a lesser red.
4. **`store-connection-signal-shows-nothing-when-there-is-no-reading`**
   - **asserts —** the pre-probe phase and the offline JSON store both produce no reading and render
     no chip; and every phase in the vocabulary resolves to a reading or an explicit absence, never
     a fall-through.
5. **`store-connection-signal-carries-no-affordance`**
   - **asserts —** the chip holds no button, link, or hover text; each state's whole message is the
     two words on its face; and it renders at the top of the map's left-hand column, above the Legend
     drawer and outside that panel's scrolling half.

## Explicitly outside this increment

- **The version skew this arc was started for.** This light is blind to it by construction — see the
  cost section above. ADR-0445 D1's migration is what closes it; the store banner's under-claiming
  message is what discloses it meanwhile.
- **Any recovery affordance.** Start DB, Wake the database, restart guidance and the retry loop all
  stay on the store banner, which owns the poller.
- **Any change to how a node is painted.** This reports on the connection; green still derives from a
  signed verdict (ADR-0040) and nothing here touches that fold.
- **A second poller, route, or health field.** The phase is already resolved and already lifted.
- **The four capabilities whose green is overwritten by a later `building` work mark**
  (`rollupStatus`, last event wins). Owner-deferred 2026-08-25, governed by ADR-0416 D3/D4.
