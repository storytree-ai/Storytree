---
status: accepted
decided: 2026-07-20
arc: grounded-art-machinery-arc
---
# ADR-0222: Split the art factory into its own story; forest-world gains a capability floor

## Status

accepted (2026-07-20) — decided/directed by the owner in conversation on 2026-07-20. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

Every session iterating on the forest user experience serialises behind a single `forest-world` work
claim, even though the surface actually spans five differently-owned things: the art factories
(`packages/procedural-architecture`), the shared scene-graph (`packages/forest-world`), the studio
chrome/CSS (`apps/studio`, owned by the **studio** story), the R3F mapper (owned by
**website-experience**), and the web repo. The owner called this out on 2026-07-20: the sessions are
locked behind each other while the surfaces they touch mostly do not overlap.

Two structural facts produce the lock, and the grounded-art arc's own increments 4, 5, and 10 each
flagged the first as an open thread wanting story-author:

1. **The art factory has no story.** `@storytree/procedural-architecture` is manifest-owned by the
   `forest-world` story and registered under no story of its own, so every art increment borrows the
   forest-world claim (and contended with unrelated sessions mid-flight — increment 5 recorded a live
   collision). It also means the factory's real, passing 152-test offline suite has no story node and
   can never be spine-signed (increment 4: "no story, no spine verdict — a structural gap to route,
   not an oversight").

2. **forest-world's `capabilities: []` makes the whole story the smallest claimable unit.**
   The empty-capabilities shape was deliberately allowed for the thin ports (proof-protocol /
   storage-protocol — the organism IS the organ) and forest-world inherited the same exemption as a
   foundational root (ADR-0093), but it is a different animal: a grown domain organism with a
   106-test suite that the map cannot render (flora only grows from capabilities, density from
   capability contract counts) and that claims cannot subdivide. The live proposal
   `forest-world-capability-floor` (owner steer 2026-07-18: minimum one capability, even a
   self-capability) records exactly this debt.

A third idea was weighed and shaped the direction: the owner asked whether art should be treated
like **library artifacts** — per-id units iterated in parallel and landed independently, instead of
locking the whole experience surface behind one session. The property is right; the knowledge-tier
DB is the wrong home for it (the public website consumes synced built output, not the live store;
baked art in git gets drift-guard tests, PR review, and deterministic pinning that the store lacks).
The art pipeline already delivers the property's substrate: ADR-0217 made art build-time DATA
(baked rosters), and ADR-0218 made the scene consume it as opaque per-id defs. What was missing is
the claim/ownership modeling above — sessions contend on the claim unit and the compose points, not
on art bytes.

## Decision

1. **The art factory becomes its own story: `art-factory`, owning
   `@storytree/procedural-architecture`.** `repo-manifest.json` `packageOwnership.organisms` moves
   the package from `forest-world` to `art-factory` (the package stays in the `foundational` set —
   it is zero-dependency). The story is authored with capabilities on the real organ boundaries
   (the shared pipeline; the per-object-type factories, ADR-0217 D1) and machine-judged `observe`
   reliability gates over the existing 152-test suite (the ADR-0085 brownfield shape), closing the
   spine-verdict gap. Art-kit increments claim `art-factory`, not `forest-world`.

2. **forest-world executes the capability-floor proposal, option A** (the owner's stated
   preference): one capability standing for the render core (geometry kernel + scene-graph), its
   contracts carrying the observed suite so the island grows honest flora. The thin-port
   empty-capabilities exemption for proof-protocol / storage-protocol is explicitly NOT reopened.

3. **Baked assets head toward a per-asset registry seam** — recorded as direction, not built here:
   extending ADR-0218's define-once/reference-many family so registering a new baked asset lands as
   a per-asset addition rather than an edit to a shared hot file (today: the kit/hero-kit rosters).
   Built when parallel art sessions actually contend on a roster file, not before (slow growth).
   DB-resident art stays a deferred fork needing its own ADR if a concrete need ever arrives (e.g.
   member-facing customization).

4. **Claim routing becomes discipline:** studio-only CSS/chrome work claims `studio`; web-mapper
   work claims the web lineage; art-kit work claims `art-factory`; only shared scene-graph changes
   claim `forest-world`. Sessions stop defaulting to "forest look ⇒ claim forest-world".

Rejected: moving art assets into the live library store (property right, home wrong — see Context);
splitting forest-world itself into many capabilities beyond the floor (no isolatable red→green legs
demand it yet); leaving the factory under forest-world with only a routing convention (the claim
unit and the spine-verdict gap are structural, not behavioural).

## Consequences

- **Good:** parallel look sessions stop serialising — the factory, the scene-graph, the studio
  chrome, and the web mapper are separately claimable lanes that match how the work actually lands.
- **Good:** the factory's suite becomes spine-signable (a story node exists to run
  `story build --real` / gate adoption against), and the map stops lying about forest-world (parcels
  + flora where a 106-test organism stands).
- **Good:** `stories/studio/story.md` gains an explicit `depends_on: art-factory` edge, making the
  studio's existing package import (`factoryBuildings.ts`, ADR-0221 fold) visible to
  `check:boundaries` on both sides.
- **Cost:** one more story to orient on; the grounded-art arc now spans two organisms (factory +
  scene-graph) and increments must name which they claim.
- **Cost / watch:** the routing rule (decision 4) is discipline until it is graduated into agent
  guidance; sessions that skip orientation can still over-claim. The noticeboard's same-unit
  refusal remains the backstop.
- The `forest-world-capability-floor` proposal retires when this lands (its readiness already
  points here).

## References

- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — the factory
  design this story now embodies; its increment-4/5 "registered under no story" consequence is the
  gap decision 1 closes.
- [ADR-0218](0218-baked-art-carries-resolved-paint-into-the-shared-scene-via-a.md) — the fenced
  baked-art family decision 3's registry seam would extend.
- [ADR-0221](0221-autumn-tree-hero-is-the-studio-garden-flag-central-tree-reso.md) — the garden
  composition seam / studio fold whose package-import edge decision 1 makes explicit.
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) /
  [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) — the
  foundational-root shape both stories keep; the thin-port exemption that stays intact.
- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — the brownfield
  observe-gate proof shape both stories use.
- ADR-0200 / ADR-0121 — the claim ledger whose unit granularity this decision corrects.
- Library: proposal `forest-world-capability-floor` (execution vehicle for decision 2);
  arc `grounded-art-machinery-arc` (the queued structural thread this realises).
