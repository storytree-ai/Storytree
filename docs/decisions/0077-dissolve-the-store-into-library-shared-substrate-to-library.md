---
status: accepted
decided: 2026-06-20
supersedes_in_part: [74]
---
# ADR-0077: Dissolve the store into library: shared substrate to library, tenant drawers to their organisms

## Status

accepted — owner decision 2026-06-20, in the forest-world "building vs island" discussion. While
pressure-testing why `library` renders as a building ([ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md)),
the owner concluded the `store` should not be a peer organism at all: *"store should be folded into
the library. It's just a foundational component of the library. The library is meant to be
centralised knowledge management for the whole system, so everything you mentioned in the store is
part of knowledge management. Just because that part of the library serves many more surfaces doesn't
mean it shouldn't be part of the library."* This **supersedes in part** [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2,
which had promoted `store` to a first-class hub organism — for `store` only. The `cli` hub modeling
(also from §2) is untouched and stands.

## Context

[ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2 made `store` its
own first-class hub story — a visible, edge-enforced node, on the argument that hiding the
most-connected package hides the most important relationships. The owner has reconsidered the
*bounded context* itself, and three facts support the reframe:

1. **The data model is one uniform substrate, not many.** `packages/store/src/schema.sql` is a single
   `events` schema in which **every** tenant — library docs, presence, users, work verdicts, comments,
   attestations, ADR numbers, binding-staleness changes — follows the identical event-sourced shape
   (an append-only `_event` history table + a current-state projection, JSONB docs, "relationships are
   id pointers held INSIDE the docs, no cross-table keys"). It is not "library persistence plus four
   other persistence systems"; it is one event-sourced document store with many drawers.

2. **`library` is the system's centralised knowledge management.** Under the owner's definition, every
   drawer in the store *is* knowledge management — the system's durable memory. A foundational
   persistence substrate that serves many surfaces is a *part of* that foundation, not a peer to it.

3. **This is the last undissolved monolith from [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md).**
   The organism rebuild dissolved the shared *schema* god-package (`@storytree/core`) into organisms
   but left the shared *store* as a single realization monolith. Folding it completes that program.

The one hard constraint is **graph position** (not purity). `store` sits *above* every schema-owning
organism: it `depends_on [library, notice-board, studio-members, base, verdict-contract]` and nothing
imports it except `cli`. `library` sits in the *middle* — many depend on it (notice-board and
studio-members already `depends_on library`). Dragging the **whole** store package into library would
force `library → notice-board` and `library → studio-members` import edges, which combined with the
existing `notice-board → library` / `studio-members → library` edges form cycles — a violation of
[ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) acyclicity and the ADR-0074 boundary gate. So
the fold must split the store by **shared-substrate vs per-tenant-drawer**, not move it wholesale.

## Decision

Dissolve the standalone `store` story and `@storytree/store` package. Route its contents by the
substrate-vs-drawer split, keeping the declared dependency graph acyclic by construction:

1. **The shared substrate folds into `library`.** The one keyless Cloud SQL connection
   (`connection.ts`), the `events` schema DDL (`schema.sql`), the live realization of the base
   `Store`/`ChangeStore` seam, the seeder/migrator (`load-corpus.ts`, `migrate.ts`, `batch-migrate.ts`),
   the render adapter (`render-doc.ts`), the Cloud SQL admin helpers, and `PgLibraryStore` (library's
   own drawer) move into `packages/library`, behind a **node-only subpath `@storytree/library/store`**
   that mirrors `packages/base`'s proven `./parity` split.

2. **Each tenant drawer moves outward to the organism that owns its doc shape**, using library's
   now-owned connection — an edge those organisms already declare (`PgPresenceStore → notice-board`,
   `PgUserStore → studio-members`), each behind that organism's own node-only `./store` subpath.

3. **Orphan drawers** (work/verdict, attestation, change, comment, adr-number — whose owning story has
   no package today) are homed per the owner decisions recorded alongside this ADR; the interim homes
   (proof drawers → `orchestrator`; comment → the library substrate; adr-number → `cli`) are chosen to
   keep the gate green and are revisable as those organisms gain packages.

4. **Browser-safety is load-bearing and preserved.** Node-only persistence (`pg`, the Cloud SQL
   connector, `node:*`) lives **only** behind the `./store` subpaths and is **never** re-exported from
   any organism's root barrel. The studio's Vite browser bundle reaches `library` only via the pure-zod
   subpaths (`/sources`, `/knowledge`, `/knowledge-render`); the two studio *server* files that touch
   the store stay `import type` + dynamic `import()`. `pnpm --filter studio build` is the explicit gate
   after each move (the `pnpm gate` studio check is `typecheck`, not the Vite build).

5. **Acyclic by construction.** `library` gains exactly one new out-edge — `library → base`, downward
   to a root (`base` never depends on `library`). Drawers go only to organisms that already
   `depends_on library`; no organism gains a back-edge into a node that depends on it. The target
   merged graph (`depends_on ∪ consumed_by`) retains a full topological order.

The migration is **phased and reversible**: `@storytree/store` survives as a thin re-export shim
re-exporting from the new homes, so every consumer keeps resolving and the gate stays green
between units, until the final unit deletes the now-empty package and scrubs the manifest. The
sequence is U0 (this ADR + graph recording) → U1 (library `./store` substrate) → U2/U3 (presence /
user drawers) → U4 (orphan drawers) → U5 (rewire `cli` + studio-server imports) → U6 (delete the
empty package, story, and boundary fixtures).

## Consequences

- **Good.** One foundation instead of two: `library` becomes the system's single centralised
  knowledge-management organism, owning the shared persistence substrate it always conceptually was.
  Completes the ADR-0068 organism rebuild for persistence (the store was its last shared monolith).
  The map decongests further and the [ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md)
  building render is *reinforced* — `library` absorbs the store's high in-degree, making "the
  foundation everything depends on" more literally true, and the previously-borderline question of
  whether `store` deserved a building dissolves (there is no `store` node).
- **Cost / risk.** The `store` node leaves the map; its runtime-conduit role is now library's, visible
  only at runtime as before. The store's two capabilities (keyless connection, events schema) become
  library substrate (kept as library capabilities or retired — an owner call at U6). `cli` is the
  heaviest coupling point (~12 source files statically import the store) and its U5 rewire is the
  highest-churn unit. Browser-safety is easy to regress: any accidental re-export of a `./store`
  module from a root barrel silently pulls `pg` into the browser graph, so the Vite build must be run
  explicitly after each move. Five orphan drawers have no natural package home and their interim homes
  defer rather than resolve their ownership.
- **Reversibility.** Phased into seven independently-gateable units; the re-export shim means any unit
  can land or be reverted on its own, and the package is deleted only once nothing imports it. The
  story-graph edits are one-line frontmatter changes, reconcilable through the normal story-authoring
  flow.

## References

- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) — store-as-hub
  organism (§2), **superseded in part here** for `store` only; the `cli` hub modeling and the boundary
  gate itself stand.
- [ADR-0075](0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md) — ports as root
  organisms; **stands and is reinforced** (library now declares `→ base` as a real downward edge).
- [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) — the organism
  rebuild this completes (store was the last undissolved shared monolith).
- [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) — acyclic declared graph, honoured by the
  substrate-vs-drawer split.
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0019](0019-library-tier-name-and-defer-dbos.md) /
  [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — the shared Postgres tier, plain pg,
  keyless IAM: unchanged (the store is still shared and keyless, now owned by library).
- [ADR-0076](0076-forest-tree-docked-line-connections-river-trail-roads-retire.md) — the building
  render the owner was pressure-testing when this decision emerged.
- Code: `packages/store/*` → `packages/library/src/store/` (substrate) + each tenant organism's
  `./store` subpath (drawers); `apps/studio/server/{libraryBackend,dbControl}.ts` stay dynamic.
