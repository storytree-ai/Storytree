---
status: accepted
load_bearing: true
decided: 2026-06-24
amends: [74]
---
# ADR-0100: Bring consuming surfaces — apps and the public website subrepo — into the boundary graph

## Status

accepted (2026-06-24) — the model was settled with the owner in conversation on 2026-06-24: the
boundary graph / observability world must include the consuming SURFACES (the `apps/*` apps and the
public-website subrepo), not just the reusable organism packages, because "everything gets included
and gains visibility" is the owner's mental model — and, as below, it is already
[ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §1/§2's own stated
principle, just never extended past `packages/*`. **Incremental** (the ADR-0074 pattern): the
apps-into-the-scan increment is BUILT (the `surface` class + the `apps/*` package-dep coverage +
the studio backfill); the public-website node is the next increment (a declared story node backed by
the existing `check:web-engine` drift gate).

## Date

2026-06-24

## Context

[ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) gated the
cross-organism dependency graph and made it UI-visible, with one frame: a **workspace package =
organism, owned by one story**. The gate (`check:boundaries`) scanned `packages/*` and nothing else.
`apps/*` and the public-website subrepo (`web/`) were never deliberately exempted with a reason —
they simply fell outside the lens, because the problem ADR-0074 was solving (hidden coupling *between
reusable packages* after `@storytree/core` dissolved) lived entirely in `packages/*`.

But ADR-0074's own stated principle is exactly "everything is visible":

- **§1** — "No package is hidden from the world. Every workspace package … is a node, and every
  cross-package edge is rendered … **never by dropping edges**."
- **§2** — an earlier recommendation to exempt the wiring layer was **rejected**: "the world's whole
  job is observability … Hiding the most-connected nodes hides the most architecturally important
  relationships."

So excluding the consuming surfaces is not an application of a counter-principle — it is an
**under-delivery of ADR-0074 §1**, left over because there was one app (`apps/studio`) that
hand-declared a few of its seams back on 2026-06-12, which made the gap look closed. A 2026-06-24
audit measured the real gap:

- **`apps/studio` showed 3 of its ~7 organism couplings.** It declared `depends_on: [library,
  drive-machinery, notice-board]` but its source imports also reach `forest-world` (the whole `#/tree`
  world geometry), `studio-members` (access control), `proof-protocol` (verdict shapes) and `cli`
  (build/secrets) — none declared, none rendered, none enforced. The forest-world edge is the one the
  owner happened to spot ("why doesn't studio have a dependency edge with forest-world?").
- **The public website had no node at all.** `packages/forest-world` is synced into the `web/`
  submodule as a built artifact and that sync is *already* gate-enforced (`check:web-engine`, the
  drift guard, plus `check:web-grounding` for the site's claims) — yet the website appears nowhere in
  the world, only in prose. It is *ahead* of apps on enforcement and *behind* on visibility.

The two surfaces are a different KIND of edge, which is why one frame did not cover them:

| tier | the edge is… | evidence mechanism | in the scan before |
|---|---|---|---|
| **package** (organism) | a package import | `check:boundaries` import + dep-graph scan | yes |
| **app** (`apps/studio`) | a package import | *nothing* | **no** |
| **subrepo** (`web/`) | a synced build artifact + a claims binding | `check:web-engine` + `check:web-grounding` (already gated) | **no** |

## Decision

**The observability world includes the consuming surfaces, not just the organism packages; each edge
is evidenced by its own mechanism.** A `surface` is a CONSUMING node — an `apps/*` app, or the public
subrepo — that wires organisms together: a **sink** at the top of the dependency order (nothing
depends on it). Its outbound code edges are covered + rendered + enforced exactly like an organism's;
the only differences are that a surface is never `foundational` and draws no inbound edge.

1. **A second package class: `surface`.** `repo-manifest.json packageOwnership` gains a `surfaces`
   map (package/app name → owning story); the pure judge (`packages/cli/src/boundaries.ts`) gains the
   class, and `storyOf` resolves an organism OR a surface so the coverage rule (every cross-story
   code edge must be a declared cross-story edge) applies to a surface's outbound edges unchanged.

2. **`check:boundaries` scans `apps/*`.** The gather walks `apps/<x>/package.json` `dependencies`
   alongside `packages/*`, so a surface's `@storytree/*` deps must each be covered by a declared edge
   in the surface's own story `depends_on` — and because the forest renders `depends_on`, that makes
   the studio's true wiring visible. A new app can no longer slip in unclassified.

3. **The public website is a declared story node backed by its drift gate, not a scanned package.**
   By construction the site consumes `forest-world`'s *built output, never the source*
   ([ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
   [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)), so there is no
   workspace package to scan. The cross-repo analog of the import scan is the **drift gate**: the
   `web/` node declares `depends_on: [forest-world]`, and `check:web-engine` (already in `pnpm gate`)
   is the mechanism that proves that edge is live. *(This node is the next increment; this ADR decides
   it, the apps increment builds first.)*

4. **Enforce, don't merely render (the ADR-0074 §2 call, reaffirmed).** A surface is a sink, so it
   cannot form a cycle or make another organism inherit hidden coupling — which weakens the
   *enforcement* half of the gate's value for surfaces. The *visibility* half is identical (a
   miswired surface is exactly the signal §2 says you most want). We considered a softer
   "render-but-don't-fail" treatment for surfaces and **rejected** it, for the same
   visibility-over-exemption reason ADR-0074 §2 gave for the `cli`/`store` hubs: a surface's
   undeclared coupling is a red gate, not a silent omission.

### Incremental scope

- **v1 — apps into the scan (BUILT, this PR).** The `surface` class + the `apps/*` dep-graph coverage
  + `apps/studio` classified in `surfaces` + the studio `depends_on` backfilled to all 7 organism
  seams (file:line-evidenced in `stories/studio/story.md`). Bringing the studio in **surfaced a real,
  pre-existing latent cycle** — `studio-cloud → studio → studio-members → studio-cloud` — exactly the
  "bad architecture becomes visible by construction" ADR-0074 promises. The honest break: the
  `studio-members → studio-cloud` edge pointed the wrong way (membership is *consumed by* the hosted
  studio's guest-scope, and `studio-members` proves its own UAT on the local guarded trial, needing
  no deployed outcome — [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)'s
  delivered-outcome test); it was dropped (`studio-members` deps `library` only, which its own
  frontmatter already said).
- **v2 — the website node (BUILT, the follow-up PR).** `stories/website/story.md` is authored
  (`depends_on: [forest-world]`, `consumed_by: []`, `capabilities: []`, status `mapped`,
  `uat_witness: machine`), its two `observe` reliability gates the existing `check:web-engine` /
  `check:web-grounding` drift guards (`website#gate-1` / `#gate-2`), so the world renders the public
  site as a consuming surface. It ships no workspace package, so it is a story node only (NOT in
  `surfaces`) — the drift gate is the cross-repo analog of the import scan (§3). The full visual UAT
  (ADR-0070 operator-attested appearance) is deferred as the node's open modeling call.
- **Not yet — the app source-import scan.** `check:boundaries`'s v2 source scan (relative-escape /
  devDep-evasion, ADR-0074) still reads `packages/<x>/src` only; the apps dep-graph coverage is the
  floor that delivers the visible+enforced edges. Extending the source scan to `apps/<x>/src` (and
  `server/`) is a later increment, one real defect at a time.

## Consequences

- The studio node renders its **true** wiring (7 declared edges, not 3); the forest-world coupling
  the owner asked about is now a visible, enforced road. A miswired app surface is a red gate.
- Bringing a surface in **forces its latent cross-story tangles to the surface** as cycles — a
  feature: it found and corrected the studio/studio-cloud/studio-members direction error.
- The public website becomes a first-class node (v2) whose edge is backed by a gate that already
  runs — visibility with no new enforcement machinery.
- One small generalisation of an offline, DB-free gate; no runtime cost.
- A surface is a sink by declaration, not by enforcement — a future tightening could assert "nothing
  declares `depends_on` a surface", but it is unneeded today (the acyclicity rule already prevents a
  surface from closing a cycle).

## References

- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) (the boundary gate
  this extends; §1 "every edge is drawn", §2 visibility-over-exemption — the principle this honors for
  surfaces), [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) (the
  no-cycle rule + the delivered-outcome dependency test that adjudicated the studio-members edge),
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) (the public site
  consumes the synced forest-world artifact, never source — why the website is drift-gated, not
  scanned), [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) (the
  one-class + foundational-subset shape this adds the `surface` class beside),
  [ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 (the boundary it gates).
- Code: `packages/cli/src/boundaries.ts` (`surface` class, `storyOf`), `packages/cli/src/check-boundaries.ts`
  (the `apps/*` gather), `repo-manifest.json` `packageOwnership.surfaces`, `stories/studio/story.md`
  (the 7 declared seams), `stories/studio-members/story.md` (the cycle break).
- The 2026-06-24 owner conversation (why apps were excluded; "bring it into the fold").
