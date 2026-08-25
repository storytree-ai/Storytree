---
id: "map-currency-signal"
tier: capability
story: studio
arc: map-freshness-arc
title: "The forest says whether what you are seeing is current"
outcome: "A developer reading the forest map is told, in three states, whether the view is current — and when it is not, which cause and which remedy."
status: proposed
proof_mode: integration-test
depends_on: [map-payload-cache]
decisions: [445, 240, 253, 40]
# GREENFIELD. The `proof:` block is spec-borne (ADR-0057) and there is deliberately NO `real:` arm,
# for the reason `arc-orientation-lens` states next door: a `real:` arm would move the pinned
# REAL-buildable snapshot in `packages/cli/src/node-build.test.ts`, and `readUnitSourceFiles`
# (packages/cli/src/check-boundaries.ts) reads ONLY `real.sourceFile` + `real.scope.sourceGlobs`, so
# with no `real` arm this unit contributes nothing to `unitSourceFiles` and the ADR-0192 landlord
# rule does not fire over it. Every file below is in `apps/studio`, this story's OWN building.
# The command is the studio's vitest suite — apps/studio is VITEST + jsdom, not node:test.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/src/lib/mapCurrency.test.ts"
      - "apps/studio/src/components/MapCurrencyLamp.test.tsx"
      - "apps/studio/src/App.map-currency.test.tsx"
    sourceGlobs:
      - "apps/studio/src/lib/mapCurrency.ts"
      - "apps/studio/src/components/MapCurrencyLamp.tsx"
      - "apps/studio/src/App.tsx"
      - "apps/studio/src/components/StoreBanner.tsx"
      - "apps/studio/src/components/TreeView.tsx"
---

# The forest says whether what you are seeing is current

**Outcome —** A developer reading the forest map is told, in three states, whether the view is
current — and when it is not, which cause and which remedy.

## Why this is one capability

The journey is one glance: a developer looks at the forest, sees an island that is not green, and
needs to know whether that is a fact about the work or an artifact of the screen. Today there is no
way to tell, and the difference is expensive — on 2026-08-25 it cost a rebuild that created no proof
and an investigation that found nothing wrong with the proof layer, because nothing was wrong with
it.

The three states, the causes behind amber, and the remedy attached to each cause are not separable.
A signal with three states but no named cause sends the developer to the wrong fix, because "serving
cache" resolves by reconnecting and "behind `main`" resolves only by rebuild-and-relaunch. A named
cause with no remedy is a diagnosis nobody can act on. And a two-state signal cannot distinguish
"this view may be under-claiming" from "there is nothing here at all", which are different facts
about different problems.

## Guidance

- **The question is CURRENCY, never connectivity — and that is the whole unit.** The signal answers
  *"is what I am seeing current?"*. It must not answer *"is the database up?"*. The reason is
  measured rather than stylistic: through the entire 2026-08-25 incident the database connection was
  perfect, so a connectivity light would have shown GREEN while the map was wrong. A signal that
  certifies the exact failure it was added to catch is worse than no signal, because it converts an
  open question into a false all-clear.
- **The mechanism the signal exists to expose.** The map JOINS two sources on different clocks: the
  PROOF (signed verdicts, read live from the store, always current) and the QUESTION (which stories,
  capabilities and criteria exist, and each criterion's exact `revision-id`, read from `stories/**`
  on the app's own disk, frozen at the commit the app was built from). Verdicts bind to criteria by
  `criterionId` + `revisionId` (ADR-0253), so an app at an older commit reads the database perfectly,
  matches no verdict for a criterion that has since been re-worded, and correctly paints yellow. It
  asked an outdated question and got an honest answer.
- **Three states, and each is a different fact (ADR-0445 D3).**
  - **green** — live data AND current code.
  - **amber** — serving cache, OR the app is behind `main`. Either way THIS VIEW MAY UNDER-CLAIM.
  - **red** — no data at all.
  Losing the database drops to AMBER and not red, because a cached paint IS data — just not
  confirmed data. The owner's original connectivity reading is therefore contained within this one
  rather than replaced by it.
- **Amber names WHICH cause, and the cause carries its own remedy (ADR-0445 D4).** The two amber
  causes resolve differently — "serving cache" by reconnecting or waiting, "behind `main`" only by
  rebuild-and-relaunch — so one undifferentiated amber actively misdirects. The remedy must be
  structurally required of a cause, not left to prose, so that a third cause cannot be added without
  answering what to do about it. What the disclosure carries is the REMEDY; it is not an explanation
  of caching, because the audience is developers who can assume the rest.
- **A reading that has not been taken is not a green.** Before the first health answer the CODE half
  of the join is simply unknown, and green would be a claim made without looking — the same fault
  class as an expectation derived from its own subject. The honest output is NO reading, rendering
  nothing at all, exactly as the store-health banner renders nothing on its `unknown` phase. A
  cached paint, by contrast, is already known to be unconfirmed and ambers whether or not any probe
  has answered — losing the server must never silence the signal that says the view may be stale.
- **Amber DISCLOSES and never blocks (ADR-0445 D5).** It withholds no data, gates no route, offers
  no dismissal, and paints no hue on any node. The world already under-claims when proof is absent
  (ADR-0040) and this must not become a second, louder refusal layered over that one. Amber says the
  ABSENCE of a green may be an artifact; it never says a green is suspect — green still derives from
  a signed verdict and cannot over-claim.
- **Read the cache that exists; do not build a second one.** `apps/studio/src/lib/payloadCache.ts`
  (ADR-0240, `map-payload-cache`) is the runtime cache, and the map's existing provisional mark is
  the serving-cache input. A runtime cache is legitimate precisely because it is never committed,
  never authoritative, never written back and always stamped (ADR-0445 D2) — the distinction from
  the committed corpus mirror ADR-0302 D1 deleted.
- **Ride the health poll that exists; do not add a second one.** `/api/health` already carries both
  code-currency facts — `code.stale` (the checkout moved under the running server) and
  `runtime.behind` for a pinned runtime — and `StoreBanner` already owns the single poller that
  fetches them. They are LIFTED from it, exactly as the payload cache's server stamp already is.
  Adding a poller instead of lifting is the wrong fix and is refused.
- **Keep the implementation boundary small.** ONE new pure client module,
  `apps/studio/src/lib/mapCurrency.ts` — no React, no `fetch`, no clock, and no store-reachability
  input at all, so the narrower question cannot creep back in as "an input we already have" — plus
  ONE presentational component, `apps/studio/src/components/MapCurrencyLamp.tsx`. The wiring points
  are `StoreBanner.tsx` (the lift), `App.tsx` (holding it), and `TreeView.tsx` (the two mounts).
- **Change no server code.** No new route, field, header or probe. Every input is already on the
  wire.
- **Prove it as an integration test.** Vitest; the pure reading directly, the render under jsdom.
  Test titles carry every contract id below, each as ONE plain string literal with the declared id
  leading it — never a concatenation and never a locally-invented id, because the coverage scan is a
  static AST scan (ADR-0126).

## Integration test

1. Drive the reading with a painted, confirmed view on current code. Assert green.
2. Drive it with the same view but the app N commits behind `main`, and with no reachability input
   available to it at all. Assert amber — this is the 2026-08-25 incident replayed under the exact
   conditions a connectivity light reads as fine.
3. Drive it with an unconfirmed cached paint. Assert amber with the serving-cache cause, and assert
   it still ambers when no health probe has answered.
4. Drive it with several causes at once. Assert every cause is reported and that their remedies are
   distinct and non-empty.
5. Drive it with a failed read and nothing painted. Assert red. Then drive it with a lost store over
   a cached paint and assert amber rather than red.
6. Drive it with a boot still in flight, and with a painted map whose health probe has not answered.
   Assert NO reading in both cases, and assert the component renders nothing for it.
7. Render each state. Assert the state is exposed as a stable marker, that the amber hover carries
   the cause and its own remedy, and that the cached-paint hover and the behind-`main` hover do not
   converge on the same remedy.
8. Render amber and assert the surface offers exactly one control — the disclosure itself — and that
   its wording says the view may be under-claiming without casting doubt on what is painted green.
9. Boot the REAL App with the REAL `TreeView` and the REAL `StoreBanner`, with `/api/health`
   reporting a healthy store and a pinned runtime N commits behind `main`, and the tree resolving.
   Assert the map paints amber naming the rebuild remedy and its commit count — the isolated tests
   above cannot fail if the lamp is never mounted or the health facts never reach it. Assert the
   same boot on a current runtime reads green, and that the amber map still paints its world in
   full.

## Contracts

1. **`map-currency-signal-answers-currency-not-connectivity`**
   - **asserts —** an app behind `main` reads amber with the store answering perfectly, and a
     confirmed paint on current code reads green; the reading takes no store-reachability input, so
     no connectivity fact can move it.
2. **`map-currency-signal-ambers-on-a-cached-paint`**
   - **asserts —** an unconfirmed cached paint is amber with the serving-cache cause, and stays
     amber while the health probe is silent.
3. **`map-currency-signal-ambers-when-the-app-is-behind-main`**
   - **asserts —** a behind-`main` app ambers with its commit count in the reading, a moved server
     checkout is its own distinct cause, and the expanded disclosure lists each cause with its
     remedy.
4. **`map-currency-signal-names-a-distinct-remedy-per-cause`**
   - **asserts —** concurrent causes are all reported, each remedy is non-empty and distinct from
     the others, and the cached-paint hover and the behind-`main` hover do not carry each other's
     remedy.
5. **`map-currency-signal-reds-only-when-nothing-is-painted`**
   - **asserts —** a failed read with nothing painted is red and says so; a lost store over a cached
     paint is amber, not red.
6. **`map-currency-signal-withholds-a-reading-until-it-has-one`**
   - **asserts —** a boot still in flight and a painted map with no health answer both produce NO
     reading, and a null reading renders no state at all.
7. **`map-currency-signal-discloses-without-blocking`**
   - **asserts —** the reading carries only a state and its causes with no field that could withhold
     or gate; the surface offers exactly one control, the disclosure; and the amber wording says the
     view may be under-claiming without calling a painted green suspect.

## Explicitly outside this increment

- **Moving the work hierarchy into the live store, or pointing any reader at it.** That is
  ADR-0445 D1 and its own increments; D6 sequences this signal ahead of them deliberately, because
  it needs no migration and would have caught this class on the day.
- **The RULE half of the skew.** A stale app still computes the crown with an old
  `rollupStoryGreen`. This signal DISCLOSES that; it does not close it, and ADR-0445's Consequences
  say so explicitly.
- **Any change to how a node is painted.** Amber is a reading about the view, never a hue on a
  story, a capability, or a crown. Green still derives from a signed verdict (ADR-0040).
- **Blocking, gating, withholding, or offering to dismiss anything on amber** (ADR-0445 D5).
- **A connectivity-only reading anywhere.** The store-health banner's existing DB phases are
  untouched and remain the place the database's own state is reported; this signal must not be
  narrowed onto that question.
- **The four capabilities whose green is overwritten by a later `building` work mark**
  (`rollupStatus`, last event wins). Owner-deferred 2026-08-25, governed by ADR-0416 D3/D4, and
  explicitly not this decision's subject.
