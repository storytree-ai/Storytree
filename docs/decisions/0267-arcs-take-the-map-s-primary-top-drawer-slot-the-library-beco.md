---
status: accepted
decided: 2026-07-29
arc: arc-orientation-surface-arc
---
# ADR-0267: Arcs take the map's primary top-drawer slot, the Library becomes secondary

## Status

accepted (2026-07-29) — decided/directed by the owner in conversation on 2026-07-29. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The forest map's primary top-drawer slot is currently the **Library lens**. ADR-0185 dec 6 retired
the standalone `#/library` page and made the Library a lens over the map; ADR-0191 gave that lens
the top-drawer handle. Today the drawer opens via `libraryHref()`'s `?overlay=library#/tree` href
(`apps/studio/src/lib/route.ts`) and renders `LibraryDrawer`.

**The owner does not use it.** In their words: *"i noticed i rarely use it. It feels like i mostly
interact with it via you, and you use it more then I do."* That is not a defect in the Library —
the pull-based, just-in-time model (ADR-0023) is explicitly agent-shaped, and agents are its heavy
readers. The defect is that the map's most valuable slot is spent on a surface whose primary
consumer is not the human standing in front of it.

**What the owner actually struggles with is arcs.** Their words: *"tracking arcs and where they are
and understanding what questions i need to answer (as well as holding context info that is needed
to answer the questions - often finding myself asking you to output diagrams and reonboard me)."*

Two things in that sentence matter for the design, and both are easy to get backwards:

1. **The need is CONTEXT RESTORATION on return, not progress reporting.** The owner: *"me often
   returning to find myself no longer holding the context needed to know where an arc is up to,
   what its about and next steps."* A percentage-complete bar would answer none of that. Neither
   would live-session presence — the notice board already renders who is working where (ADR-0200),
   and it does not solve this. What is missing is the ability to reload an initiative's *subject
   and state* into a human head, cold, after an absence.
2. **Questions are part of the payload, not a separate feature.** The owner needs to know *"what
   questions i need to answer"* AND to be holding *"the context info that is needed to answer the
   questions"*. A surface that lists open questions but forces a re-onboarding round-trip to answer
   them has not moved the problem.

The owner frames an arc as *"self driving human in the loop orchestration sessions that self
perpetuate or get driven by me"* — the unit that carries an initiative between the owner's visits.
That is exactly the unit that should own the slot.

There is no arc surface today. `arc` is a flat artifact category in the studio
(`apps/studio/src/types.ts`), and the derived arc → children join (ADR-0183 D3) exists only in the
CLI.

## Decision

### D1 — Arcs take the primary top-drawer slot the Library currently occupies

The `?overlay=library` top drawer over the forest map becomes an **arc** surface. This is a
reassignment of the map's most prominent slot to the unit the owner actually navigates by.

### D2 — Arcs stay ON the map

This is explicitly **not** a new top-level route or page. The owner: *"Arcs should stay on the
map."* ADR-0204 (the forest map is the landing surface; the standalone Overview/Home page is
retired) is **not** overturned, nor is ADR-0185's retirement of standalone lens pages. Whatever is
built here is an overlay on `#/tree`, in the ADR-0191 drawer idiom. A future session that reads D1
as licence to add `#/arcs` has read it wrong.

### D3 — The Library becomes a secondary option, and its future shape is OPEN

The Library stays reachable — demoted, not removed. Its eventual shape is deliberately **not**
decided here. The owner is explicitly open to reworking it: *"i'm option to redesigns of the
library."* Recorded as open; a later ADR settles it. Note that the Library's agent-facing surface
(the CLI, ADR-0023) is untouched by this — this decision is about the human map's slot allocation
only.

### D4 — Open questions nest inside arcs, via an `arcRef` ON THE QUESTION

An arc surfaces the questions waiting on the owner. **The containment edge is stored on the
CHILD**: this means an `arcRef` on the `open-question` kind, mirroring the existing `plan.arcRef`,
and the arc's question view is **derived by query**.

This constraint is ADR-0183 D3 and it is the thing a later session is most likely to get backwards.
It does **not** mean an authored question-list field on the arc. Quoting D3: every containment edge
is *"stored on the child; the upward view is derived by query"*, and *"the arc reveals its
plans/stories/ADRs dynamically; it is never edited when a child is born."* An authored list on the
arc would need editing every time a question is raised or closed, which is precisely the rot D3
exists to prevent — and it would break the same way ADR-0183 D4's file-list rule breaks.

### D5 — `oq-diff-view-altitude` is closed

The owner: *"we currently just have the one open question on code diffs and i think it should be
closed - its not relevant yet - if we do need this feature it would needed later."* It is retired
from the live store with that rationale.

**How an open question is actually closed**, since this is under-documented and was checked against
the code rather than assumed: the `open-question` kind carries **no lifecycle field**.
`lifecycleOf('open-question', doc)` (`packages/library/src/lifecycle.ts`, the ADR-0196 D4 single
home of the mapping) returns `open` unconditionally, and the schema is `.strict()` with no
`status`/`route` extension — so there is no field to set, and inventing one would be refused at
validation. Closure is **retirement**: `storytree library artifact retire <id> --reason "..." --pg`,
a delete that folds the rationale onto the append-only `deleted` event. This matches
`oq-gating.ts`'s stated model — a resolved OQ *"has dropped out"* of the live projection, which is
how resolving one unblocks a gated story's green.

Because `open-question` is a `SEED_SCOPE_KINDS` kind, the retire is a **two-surface** operation:
the seed entry in `apps/studio/data/knowledge.json` must be removed in the same change. Leaving it
would make the question a seed artifact missing from live, which `check:corpus-sync` — at a zero
drain ceiling since 2026-07-28 (ADR-0252 D3) — fails the local gate on, and which
`sync-corpus --pg` would silently resurrect.

### What is deliberately NOT decided here

Recorded as open, to be settled by later increments of `arc-orientation-surface-arc`:

- **The UI shape** of the arc surface.
- **How multiple arcs are visualised** together.
- **Whether questions are answered in the surface or only found there** — i.e. whether the surface
  is read-only orientation or also an answering affordance.

The owner's next request is mock options for exactly these. This ADR settles the slot and the
topology; it does not settle the picture.

## Consequences

**Good.**

- The map's most prominent slot serves the human standing in front of it, and the surface the
  owner actually reaches through an agent stops occupying prime real estate.
- The `arcRef`-on-the-child topology (D4) means the arc is never edited as questions come and go —
  the same property that keeps plans ceremony-light under ADR-0183 D3.
- Closing `oq-diff-view-altitude` (D5) leaves the open-question tier empty of stale items, so the
  first thing an arc surface renders is honest.

**Costs and risks.**

- **`arcRef` on `open-question` is a schema change** — a `.extend()` on the kind, mirroring
  `Plan`. It is additive and optional, so on the `stepRefs`/`increments` precedent it needs no
  `CURRENT_SCHEMA_VERSION` bump; that must be re-verified against `migrations.ts` when it is built.
- **This ADR is blocked on ADR-0239 for a usable surface.** `storytree arc list --pg` currently
  returns 22 arcs with **no live/closed distinction** — finished arcs render identically to live
  ones. An orientation surface that opens on 22 undifferentiated arcs, most of them done, restores
  no context; it manufactures the confusion it exists to remove. ADR-0239 (arc closure as stored
  state) proposes the fix and is **still `proposed`, awaiting the owner** — it is a known
  dependency of this arc, out of scope here, and the owner ratifying it is on the critical path.
- **The infrastructure gap is real and is another session's job.** There is no arc view in the
  studio beyond a flat artifact card, and the derived arc → children join is CLI-only. Building
  the join into the studio's read path is companion work, not part of this decision.
- **The Library's demotion leaves it in an interim state** until D3's open redesign lands: reachable
  but no longer privileged, with no decided replacement shape. That is accepted deliberately rather
  than blocking the slot reassignment on a Library redesign.

## References

- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment
  is ratification; this ADR is born `accepted`.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — arcs and plans;
  **D3** is the containment-edge-on-the-child rule D4 above rests on, and D4 the surface rule that
  keeps implementation detail out of the arc body.
- [ADR-0185](0185-library-as-a-tech-tree-overlay-on-the-forest-map.md) — retired the standalone
  `#/library` page and made the Library a lens over the map.
- [ADR-0191](0191-library-lens-defaults-to-a-top-drawer-handle-lens-state-is-u.md) — gave the
  Library lens the top-drawer handle this ADR reassigns.
- [ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) — **D4**: `lifecycleOf` is the
  single home of the kind → lifecycle mapping, and `open-question` has no closed state in it.
- [ADR-0204](0204-retire-the-studio-banner-full-bleed-forest-with-a-hud-avatar.md) — the forest map
  is the landing surface; **not** overturned by D2.
- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) — arc closure as
  stored state; `proposed`, and a known dependency of this arc's surface.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the pull-based Library model, whose
  agent-facing CLI surface D3 leaves untouched.
- `arc-orientation-surface-arc` — the arc this ADR was produced by.
