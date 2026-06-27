---
status: accepted
load_bearing: true
---

# ADR-0002: The work hierarchy — story, capability, contract

## Status

accepted

> Amended by ADR-0010 (proof ladder, dependency grain, DAG grain).

**Superseded-in-part by [ADR-0010](0010-organism-model-story-bounded-context.md)** — this ADR's proof-mode table is overtaken: the proof ladder shifts up one rung (the **UAT moves from the capability to the story**, the capability is proven by integration tests against real in-story collaborators), and the deferred DAG-grain question is resolved (stories carry declared-interface edges; capabilities carry a code-derived within-story graph).

## Date

2026-06-03

## Context

ADR-0001 deferred "the story / contract / event **schema**" to `packages/core`
as the next decision. This ADR makes the conceptual half of it: the **work
hierarchy** — what a unit of work is, at what grain, and how each grain is
proven. `packages/core` then encodes these terms as the schema every layer
speaks.

v1 (the Agentic corpus) had a single provable grain: a "story" was a component
proven by tests and a UAT walkthrough. In practice that grain was too **fine**
to double as a system map — the tree fragmented to behaviour-sized nodes (e.g.
"parse one event type"), and the top-level view became a wall of serde-sized
cards instead of a legible map. The map wants a **coarser** top unit; prove-it
rigor wants a **finer** one. v1 collapsed both onto one word. storytree splits
them into three tiers, and the boundary between tiers is the **proof mode**.

## Decision

Three tiers, top to bottom:

- **story** — the top-level unit you watch grow, and a node on the DAG the
  studio renders. A coherent, independently-meaningful body of work, *composed
  of capabilities*. Deliberately **bigger** than v1's story: it is the map
  grain — the thing a newcomer points at ("the event store", "the tree
  renderer"), not a single behaviour.

- **capability** — a component within a story: **independently viable** (it
  stands on its own — the unit you could specify and prove in isolation),
  **integration-proven** (against real in-story collaborators), and composed of
  contracts. This is *exactly what v1 called a story*. The UAT lives at the story
  (ADR-0010 §2); the capability is the unit within-story dependencies are drawn
  between.

- **contract** — a single **test-proven behaviour** within a capability: one
  automated, isolated test (collaborators stubbed). The leaf. (In v1 "contract"
  was unusable — every agent had a `contract.yml`, triple-booking the word.
  storytree is greenfield with no such file, so the word is free and correct
  here.)

**The boundary is the proof mode** — this is the rule that decides a unit's tier:

| Tier | Proven by | Isolation |
|---|---|---|
| story | ≥1 integrated **UAT** walkthrough (minimal-first, grown as defects surface) | integrated — **real**, the whole organism end to end |
| capability | ≥1 **integration test** + all its contracts green | **real in-story collaborators** (no stubs within the organism) |
| contract | one automated test | isolated — collaborators stubbed |

Decision rules that fall out of the table:
- A unit is a **story**, not a capability, if a standalone UAT makes sense for it
  — you can walk its goal end-to-end as a whole organism.
- A unit is a **capability**, not a contract, if its honest proof is an
  integration test against real in-story collaborators.
- A unit is a **contract**, not a capability, if the only honest proof is an
  isolated automated assertion (collaborators stubbed), with no walkable journey
  of its own.

**Dependencies are generated, not hand-drawn** — at two altitudes (ADR-0010 §3):
- **Within a story**, capability edges are **code-derived** (static analysis of
  the imports/calls between capabilities); inside the boundary a dependency *is*
  the code coupling. "You cannot prove a capability that stands on an unproven
  one" still falls out as a consequence, not a separate rule.
- **Across stories**, dependencies are **declared-interface-only** — a story may
  depend on another *only* through a documented interface (ADR-0010 §3-§4);
  hidden cross-story coupling is forbidden.

## Why "capability" (the naming decision)

The middle tier needed a name; "story" was taken (promoted up) and "contract"
was taken (pushed down). Filtered against the actual stack — React + `@pixi/react`
+ TS:

- **epic** — rejected. The big unit should read as a *story* (a narrative you
  watch grow), not project-management jargon.
- **component** — the most literal word, and the first instinct, but it collides
  head-on with React/PixiJS components in `apps/studio`. A `Component` type in
  `packages/core` next to `React.Component` reintroduces exactly the
  double-booking we are escaping.
- **module** — encodes the *deep-modules* principle the model rests on (a deep
  module = a simple interface over rich implementation), but soft-collides with
  ES modules in a TS codebase (every file is a "module").
- **part** — collision-free but flavorless.
- **capability** — **chosen.** Collision-free in the stack, accurate for
  storytree's real units (the event store, the scheduler, UAT-promotion, the
  renderer), legible to a newcomer, and it reads correctly in the load-bearing
  sentence: *"a story is a set of capabilities; a capability is guaranteed by
  contracts."*

## Consequences

**Gained.** A coarse, legible top-level map (stories) over a finer provable
grain (capabilities) over an automated leaf (contracts) — the altitude mismatch
v1 suffered is designed out. The vocabulary is collision-free in the stack and
goes straight into `packages/core` as the shared schema.

**Paid.** Three tiers to model and render instead of one, and a
`story`-vs-`capability` boundary call on every authored unit — resolved by the
proof-mode table above.

## What this does NOT decide

- **The exact DAG grain** — *Resolved by ADR-0010* (stories carry interface-edges
  via declared cross-story interfaces; capabilities carry their own within-story,
  code-derived graph).
- **How a story's proof composes** — *Resolved by ADR-0010* (the story carries
  the UAT; it is no longer a pure rollup).
- **Whether a fourth grouping tier (an "epic" over stories) ever returns.** Not
  now; not precluded.

## References

- ADR-0001 (deferred this schema to "next").
- `docs/glossary.md` — the canonical one-line definitions these terms resolve to.
- v1 corpus (`C:\code\Agentic`), `docs/decisions/0027-*` — drafted the
  epic/story/contract precursor this reshapes (story promoted up, **capability**
  inserted as the provable middle grain).
- Design conversation, 2026-06-02/03.
