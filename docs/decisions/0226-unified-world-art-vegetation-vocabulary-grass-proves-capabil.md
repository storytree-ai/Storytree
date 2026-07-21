---
status: accepted
decided: 2026-07-21
amends: [221]
arc: grounded-art-machinery-arc
---
# ADR-0226: Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost

## Status

accepted (2026-07-21) — decided/directed by the owner in conversation on 2026-07-21. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends ADR-0221 (extends the
`autumn-tree` hero from the single garden-flag island to every island's central tree).

## Context

A forest-world island renders several living-surface signals, and two of them collide:

- The **meadow** (`meadowSurface`) grows grass whose density scales with a capability's test count
  (`grassCount = 2 + tests·1.9`), and ALSO scatters decorative 4-petal wildflowers as a "healthy" accent.
- The **UAT markers** (`tallFlowerMarks`, grounded-art inc 7) grow one *tall* flower per UAT criterion,
  scattered across the island, form-reading the verdict: bloomed daisy = proven, closed bud = pending,
  wilted head = failing.
- The **human-witness signpost** (`buildSignpost`) plants a post + seal beside the tree: blank
  (`sign-blank`, reads white) until the UAT verdict is signed, a filled seal (`sign-pass`/`sign-fail`) after.
- The **crown bloom** (`buildBloom` 'crown') already paints the signed story verdict on the crown.

Two problems. First, **"flower" means two different things** — a decorative meadow accent AND a UAT
criterion — so the island's most load-bearing signal (did this story pass its journey?) competes
visually with mere decoration. Second, the **witness signpost is redundant**: it says "awaiting /
passed UAT" at the story level, which the UAT flowers already say per-criterion and the crown bloom
already says on a signed verdict — three markers for one idea. Compounding both, the *tall*
1:1-per-criterion flower scatter reads busy against the cosy-island concept, which wants a few legible
reads, not a marker field (a flagged concern since inc 7).

Separately, ADR-0221 placed the `autumn-tree` hero as the central tree on ONE island (the studio
garden-flag exemplar); every other island still grows the procedural `story-tree` (`buildTree`). The
owner wants the hero tree to be the island's tree everywhere, so the whole map reads as one authored world.

## Decision

Make the island's living surface **one legible language**, studio-side:

1. **The hero tree is every island's central tree** (amends ADR-0221). In `buildTerritoryFlora`'s
   normal (non-garden) path, the procedural `buildTree(t)` is replaced by a `<use>` of the baked
   `autumn-tree` hero (`gardenHeroUse` + `fittedHeroScale`), define-once / reference-many like the
   garden. This is independent of the full garden composition — a non-garden island keeps its grass,
   capability flora, and UAT markers; only its tree becomes the hero. Behind a default-off studio
   toggle for the owner's look-verdict first, then promoted.

2. **Grass = a capability's tests.** The meadow reads as grass; density continues to scale with test
   count. The decorative 4-petal wildflower accent is **retired**, freeing "flower" to mean UAT and
   only UAT.

3. **Grass health = the capability's proof state.** An unhealthy capability's grass reads as **dead
   grass** — status-driven (the existing wilt/dead state), NOT per-test. Per-test dead blades are
   deliberately out of scope: no per-test pass/fail signal reaches the fold, and a capability-level
   `unhealthy` is honest without new plumbing.

4. **Flowers = the story's UAT criteria** — one marker per criterion (**still 1:1**), the verdict read
   from form: unbloomed bud = awaiting UAT, bloomed = UAT passed, wilted = failing. The marker is the
   **grounded baked-vector flower landed in increment 14** (`uat-flower.ts`, PR #862 — the owner's
   "grounded flower, still 1:1" pick), placed into the scene in place of the flat `tallFlowerMarks`
   decal and sized **small** so it reads as a low meadow flower, not a tall scatter. *(This reconciles
   the as-merged wording of this decision: the marker stays one-per-criterion, NOT folded/aggregated —
   the owner rejected the aggregate-hero option for inc 14 — and its substrate is the baked inc-14
   asset, not a shrink of the flat primitive. The decision — small, 1:1, verdict-from-form — is
   unchanged; only the substrate description is corrected.)*

5. **The human-witness signpost is retired.** `buildSignpost` and its `sign-blank | sign-pass |
   sign-fail` kinds are removed. Story-level UAT state is carried by the (now small) UAT flowers and,
   on a signed verdict, the crown bloom.

Invariants preserved: colour-is-class (ADR-0093 §4 — values shift, geometry/placement never go
inline); the honesty wall (ADR-0045 — only a signed UAT pass blooms; a bud is never a bloom);
one-element-per-signal (ADR-0062); and the back-compat lock — absent `uatCriteria` / the hero input,
the scene renders byte-for-byte (the public website never sends them, so its render is unchanged).

## Consequences

Good:

- One reading of the island: **grass = the proving work (a capability's tests), flowers = the story's
  UAT, dead grass = failing** — a viewer learns three shapes and reads the whole map.
- The grass/flower ambiguity is gone (grass = tests, flowers = UAT); the *tall* scatter shrinks to
  small low flowers; three redundant UAT markers collapse to the flowers plus the crown bloom.
- The hero tree everywhere makes the map read as one authored world, and — define-once /
  reference-many — likely *reduces* node count versus the per-island procedural tree it replaces.

Trade-offs accepted:

- **No dedicated story-level "awaiting witness" seal.** The at-a-glance blank signpost is gone; UAT
  state now reads from the flowers (per-criterion) plus the crown bloom (signed verdict). Accepted:
  those already carried it, and the blank-white seal competed with the cosy palette.
- **Dead grass is status-granular, not per-test.** A capability is dead-grassed as a whole when
  unhealthy, not per failing test. Deliberate simplification; per-test granularity is a later
  increment only if it earns its plumbing.
- The witness state is no longer specially marked as *human*-witnessed vs. machine-proven. Accepted
  (the distinction was rarely legible at map scale).

Landing:

- Touches `packages/forest-world/src/scene.ts` (shared scene-graph) → claim `forest-world`; CI
  `check:web-engine` triggers the web-engine sync + pin + owner-gated deploy dance. The website render
  is unchanged (it never sends `uatCriteria` or the hero input), so the publish is a source-sync, not
  a visible website change.
- **Remaining build units, sequenced to avoid conflicting on `buildTerritoryFlora`:** increment 14
  already landed the UAT-flower *asset* (`uat-flower.ts`, PR #862) — awaiting its stage-2 look verdict
  and not yet placed in `scene.ts`. What remains is (a) **placing that flower small + the surrounding
  vegetation vocabulary** (decisions 2–5) and (b) the **tree-spread** (decision 1). Each is a frontend
  increment with an operator-attested stage-2 look verdict (ADR-0070) — neither is self-signed. *(The
  flower session named in the arc log landed inc 14 concurrently rather than being resteered — the
  resteer was moot.)*

## References

- Amends ADR-0221 (autumn-tree hero as the garden-flag central tree — now every island).
- ADR-0208 / grounded-art increment 7 (the flat tall-flower UAT markers this redefines as small).
- Grounded-art increment 14 / PR #862 — the grounded baked UAT-flower asset this places small
  (`packages/procedural-architecture/src/landscape/uat-flower.ts`).
- ADR-0093 §4 (colour-is-class), ADR-0045 (only a signed verdict blooms — the honesty wall),
  ADR-0062 (one element per signal), ADR-0070 (operator-attested look verdicts).
- Arc: grounded-art-machinery-arc.
- Code: `packages/forest-world/src/scene.ts` — `meadowSurface`, `tallFlowerMarks`, `buildSignpost`,
  `buildTree`, `buildTerritoryFlora`, `gardenHeroUse`, `fittedHeroScale`.
