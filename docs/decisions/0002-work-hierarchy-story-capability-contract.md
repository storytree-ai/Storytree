# ADR-0002: The work hierarchy — story, capability, contract

## Status

accepted

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
  **UAT-proven**, and composed of contracts. This is *exactly what v1 called a
  story*. It carries the integrated UAT walkthrough and it is the unit
  dependencies are drawn between.

- **contract** — a single **test-proven behaviour** within a capability: one
  automated, isolated test (collaborators stubbed). The leaf. (In v1 "contract"
  was unusable — every agent had a `contract.yml`, triple-booking the word.
  storytree is greenfield with no such file, so the word is free and correct
  here.)

**The boundary is the proof mode** — this is the rule that decides a unit's tier:

| Tier | Proven by | Isolation |
|---|---|---|
| story | composition — its capabilities are proven | — |
| capability | ≥1 integrated UAT walkthrough (minimal-first, grown as defects surface) + all its contracts green | integrated — real collaborators |
| contract | one automated test | isolated — collaborators stubbed |

Decision rules that fall out of the table:
- A unit is a **capability**, not a contract, if a standalone UAT makes sense
  for it — you can walk its goal end-to-end.
- A unit is a **contract**, not a capability, if the only honest proof is an
  automated assertion, with no walkable journey of its own.
- A unit is a **story**, not a capability, if it is a grouping whose proof is
  just the sum of its capabilities'.

**Dependencies are generated, not hand-drawn.** A capability's UAT runs against
its *real* collaborators; wherever capability A's walkthrough needs capability B
to be real, B is upstream of A. "You cannot prove a capability that stands on an
unproven one" then falls out as a consequence, not a separate rule. (Carried
from v1's design work.)

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

- **The exact DAG grain — decided (amended 2026-06-04):** stories **do** form a
  DAG; they depend on each other. A story→story edge is **derived** from
  capability dependencies (story X depends on Y when a capability in X needs one
  in Y), and may also be **authored** during decomposition — the derived graph is
  the source of truth, and an authored edge no capability backs is a signal to
  surface. Capabilities remain the fine-grained graph beneath, and a story's
  *proof* is still pure composition. `packages/core` encodes both levels.
- **How a story's proof composes** beyond "its capabilities are proven" (e.g.
  whether a story may carry its own thin integration UAT). Default for now: pure
  rollup.
- **Whether a fourth grouping tier (an "epic" over stories) ever returns.** Not
  now; not precluded.

## References

- ADR-0001 (deferred this schema to "next").
- `docs/glossary.md` — the canonical one-line definitions these terms resolve to.
- v1 corpus (`C:\code\Agentic`), `docs/decisions/0027-*` — drafted the
  epic/story/contract precursor this reshapes (story promoted up, **capability**
  inserted as the provable middle grain).
- Design conversation, 2026-06-02/03.
