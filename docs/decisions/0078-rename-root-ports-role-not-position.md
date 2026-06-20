---
status: accepted
decided: 2026-06-20
amends: [75]
---
# ADR-0078: Rename the two root ports for role, not position (verdict-contract→proof-protocol, base→storage-protocol)

## Status

accepted (2026-06-20, owner) — directed live in a session explaining the ports.
**Amends [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) §1** (the
package / story names it ratified): the two foundational root organisms are renamed. This is a
**names-only** change — no dependency-graph shape, package class, rule, or gate logic moves.

## Date

2026-06-20

## Context

[ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) collapsed the
`substrate` class and made the two shared ports — then `@storytree/verdict-contract` and
`@storytree/base` — ordinary root organisms every consumer declares `depends_on` against.

`base` was named for its **position** — "the foundation, the bottom." But ADR-0075 itself shifted that
position, stating plainly: *"verdict-contract is now the bottom root the whole graph rests on (not
library); base is the second root."* So `base` named a spot it no longer holds — `verdict-contract` is
more "the base" than `base` is. A position-name that points at the wrong position actively misleads a
reader trying to learn the graph (the exact confusion in the session that produced this ADR). And
`verdict-contract`, while accurate, undersells that it is the shared *vocabulary* organisms exchange
verdicts/proof through, and pairs poorly with its sibling port.

Position-names age badly exactly this way; role-names don't:

- **`base` → `storage-protocol`** — it is the storage *seam*: the `Store` / `ChangeStore` verbs + the
  `InMemoryStore` reference, the contract every persisting organism plugs a backend into.
- **`verdict-contract` → `proof-protocol`** — it is the published verdict/proof *shape*, the message
  format organisms validate across the boundary.

## Decision

Rename the two foundational root ports — directory, package name, owning-story id, and every declared
edge, in lockstep:

- `@storytree/verdict-contract` (story `verdict-contract`, `packages/verdict-contract`) →
  `@storytree/proof-protocol` (story `proof-protocol`, `packages/proof-protocol`).
- `@storytree/base` (story `base`, `packages/base`) → `@storytree/storage-protocol` (story
  `storage-protocol`, `packages/storage-protocol`).

Nothing else changes. The dependency DAG (`proof-protocol` is the bottom sink, depending on nothing;
`storage-protocol` depends only on `proof-protocol`), the single `organism` class, the `foundational`
subset and its minimality rule, and the boundary gate are all identical — only the identifiers move.
`repo-manifest.json` `packageOwnership`, the consumer stories' `depends_on`, and every import are
updated together. The boundary judge (`packages/cli/src/boundaries.ts`) reads names from the manifest,
so no code constant changes.

The historical ADRs (0068 / 0074 / 0075) keep their original `verdict-contract` / `base` wording as
the immutable record of what was decided then; this ADR is the pointer from the old names to the new.

## Consequences

- **The graph is self-documenting again.** A new reader meets `proof-protocol` (the message format)
  and `storage-protocol` (the storage seam) and learns each port's role from its name — instead of
  "base" pointing at a position it lost in ADR-0075.
- **A one-time mechanical rename** across ~50+ source files + the manifest + the two stories; pure
  identifier churn, gated green by the offline gate (`pnpm -r typecheck && pnpm -r test`, including
  `check:boundaries` + `check:manifest`).
- **The phantom-dependency cleanup is bundled here (owner call, 2026-06-20).** `notice-board` and
  `studio-members` declared `@storytree/storage-protocol` (and the matching `depends_on` edge) yet do
  **not** import it — they roll their own duck-typed pool seam (the event-sourcing *pattern*, duplicated
  not shared). This PR removes those stale deps + edges, so the forest no longer renders the false
  coupling, and the declared story graph now matches the real import graph for these two organisms.

## What this does NOT change

- The dependency-graph shape, the package class model, the foundational-minimality rule, or the
  boundary gate logic — only identifiers.
- The historical ADRs (0068 / 0074 / 0075), which keep their original wording.
- The store→library fold ([ADR-0077](0077-dissolve-the-store-into-library-shared-substrate-to-library.md)):
  `storage-protocol` is the storage *seam* (a port); the library substrate is the Postgres
  *implementation*. Renaming the seam does not touch that fold — it sharpens the seam-vs-implementation
  distinction.

## References

- [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) (ports as root
  organisms — names amended here),
  [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) (the boundary gate),
  [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) (made the boundary
  physical; introduced the first port),
  [ADR-0077](0077-dissolve-the-store-into-library-shared-substrate-to-library.md) (store→library; the
  seam-vs-implementation split this rename keeps clean).
- `repo-manifest.json` `packageOwnership`; `stories/storage-protocol/story.md`,
  `stories/proof-protocol/story.md`.
- Live-library open-question `oq-port-class-vs-root-node` (the A/B the owner settled in ADR-0075).
