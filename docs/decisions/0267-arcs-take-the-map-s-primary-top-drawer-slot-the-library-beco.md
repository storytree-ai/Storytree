---
status: accepted
decided: 2026-07-29
arc: arc-orientation-surface-arc
---
# ADR-0267: Arcs take the map's primary top-drawer slot, the Library becomes secondary

## Status

accepted (2026-07-29) — decided/directed by the owner in conversation on 2026-07-29. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Extended in place (2026-07-30) with D6 and D7** — two further decisions from the *same* design
conversation that reached this ADR after D1–D5 had landed. Additive: nothing in D1–D5 is retracted.
D6 does overtake one item this ADR had listed as undecided; that entry is corrected in place per
ADR-0139 rather than by a superseding ADR, because this is one decision event, not a re-decision.

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

**Settled by [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) D6
(2026-08-05):** the Library becomes an `Arcs | Library` toggle in the drawer header — the same slot,
one click, arcs as the default.

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

*(WITHDRAWN as an instruction 2026-08-06 — corrected in place per ADR-0139; nothing this ADR decided is
re-decided. The retire is no longer two-surface and there is nothing to do in a second place:
ADR-0302 D1/D4 deleted `apps/studio/data/knowledge.json`, `sync-corpus` and `check:corpus-sync`
together, so there is no seed entry to remove, no gate to red, and no resurrection risk. A live retire
is now the whole operation. Do not go looking for the seed file.)*

### D6 — The surface is READ-ONLY this round; two-way is deferred, not rejected

The owner: *"i think it should just all be a read surface for now, once i get a feel for this then we
can look at it being two way, for now i would prompt you (claude code or some other agent harness to
answer the questions or get more info)"*.

So this round ships **no write path**: no in-surface answering of questions, no comment affordance,
no edit. Answering happens the way it happens today — the owner prompts an agent harness.

**Two-way is an explicitly deferred follow-on, not a rejected option**, and the owner stated its
trigger: once they have a feel for the read surface. A later session must not read "read-only" as a
settled principle about what this surface may ever be; it is a staging decision with a named
re-open condition.

Note this **overtakes** one of the items this ADR originally listed as undecided — "whether questions
get answered in the surface or only found there" is now answered (found there, answered elsewhere).
Corrected in place per ADR-0139 rather than by a superseding ADR: same conversation, same decision
event, nothing reversed.

### D7 — What the surface must show

From the top panel over the forest, for the arcs in play:

- which arcs are **currently running**, and **where they are at**;
- which are **waiting** — meaning they have open questions;
- which are **blocked**;
- clicking an arc reaches its open questions, to read them (read-only, per D6).

**`waiting` and `blocked` are DISTINCT states and must not be collapsed.** The owner named them
separately. `waiting` has a definition here — the arc has open questions. `blocked` deliberately does
**not**: what qualifies as blocked is left to the mock round rather than over-specified now. A
session that quietly makes `blocked` a synonym for `waiting`, or that invents a `blocked` predicate
to close the gap, has exceeded this decision.

**`blocked` now HAS a definition — [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md)
D4, from the owner on 2026-08-05:** the arc cannot proceed and there is nothing for the owner to
answer (a claim it cannot take, or an unmet dependency), as against `waiting`, which is a question
they can answer on the spot. The mock round did its job and the fence above did too — the three
predicates it derived were all rejected as measuring the symptom rather than the cause. The
must-not-be-collapsed rule stands unchanged.

D7 is what makes ADR-0239 load-bearing rather than merely adjacent: "currently running" is not
answerable while arc closure is prose in `endState` (see Consequences).

### What is deliberately NOT decided here

Recorded as open, to be settled by later increments of `arc-orientation-surface-arc`. **All three
were settled on 2026-08-05 by [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md),
which amends this ADR** — the list is kept, with each item's resolution, because the reasoning for
leaving them open is still the reasoning that shaped the answers:

- ~~**The UI shape** of the arc surface — the visual design, and **how multiple arcs are laid out**
  together. This is the owner's next deliverable: mock options.~~ → **Settled: ADR-0314 D1/D2/D3.**
  The mock round ran (#1087, four options); the owner picked momentum lanes with the time axis
  deleted, bars that count units rather than days, and a briefing panel in the space that frees.
- ~~**What `blocked` means** (D7) — named as a distinct state, deliberately not defined here.~~ →
  **Settled: ADR-0314 D4.** `blocked` = the arc cannot proceed and there is nothing for the owner to
  answer (a claim it cannot take, or an unmet dependency); `waiting` = an authored question the owner
  can answer on the spot. All three predicates the mock round derived were rejected.
- ~~**Whether the orchestrator should be required to author an open-question briefing at escalation
  time.** Today agents escalate in chat rather than authoring an `open-question`, which is why the
  kind holds so few. This is arguably the higher-leverage half of D7 — it governs whether the read
  surface has anything worth reading — and it is unsettled.~~ → **Settled: ADR-0314 D5 — yes,
  required.** The judgement that this is the higher-leverage half was borne out: by 2026-08-05 the
  open-question tier had fallen from one (unhomed) to **zero**, so without D5 the surface's entire
  waiting half would be decorative.

*(Also struck from this list, earlier, by D6: "whether questions are answered in the surface or only
found there" was originally recorded here as open. The owner settled it in the same conversation —
read-only this round. Corrected in place per ADR-0139.)*

This ADR settles the slot, the topology, the read/write posture, and the state vocabulary; it does
not settle the picture.

## Consequences

**Good.**

- The map's most prominent slot serves the human standing in front of it, and the surface the
  owner actually reaches through an agent stops occupying prime real estate.
- The `arcRef`-on-the-child topology (D4) means the arc is never edited as questions come and go —
  the same property that keeps plans ceremony-light under ADR-0183 D3.
- Closing `oq-diff-view-altitude` (D5) leaves the open-question tier empty of stale items, so the
  first thing an arc surface renders is honest.

**Costs and risks.**

- **`arcRef` on `open-question` was a schema change, and it is now BUILT** (increment 1, PR #1020) —
  a `.extend()` on the kind, mirroring `Plan` but OPTIONAL where the plan's is required, so a question
  can be raised before any arc owns it and every pre-existing question still validates. Additive and
  optional, so on the `stepRefs`/`increments` precedent it needed no `CURRENT_SCHEMA_VERSION` bump —
  this ADR asked for that to be re-verified against `migrations.ts` rather than assumed on the
  precedent, and it was: all three registered migrations only DROP fields, so each no-ops on a doc
  carrying the new edge, and the verification is now an executable test rather than a claim.

  *Measured 2026-08-03:* the edge exists, and nothing carries it yet. The live `open-question` tier
  holds exactly one question (`oq-public-live-forest-on-the-website`, raised 2026-08-02) and it has no
  `arcRef`, so `arc show` renders "(none)" for all 17 active arcs. That is the **third open item
  below** — whether escalation must author an open-question — surfacing as an empty view, not a defect
  in the derived join.

  *Updated later the same day (2026-08-03):* that question was ANSWERED by
  [ADR-0299](0299-the-public-website-shows-the-real-forest-as-a-baked-redacted.md) and retired, so
  the live `open-question` tier is now **empty**. Nothing above is falsified and the third open item
  is sharpened rather than settled: the tier reached zero because its only occupant was discharged,
  not because the edge or the join failed. Until escalation is required to author an open-question,
  `arc show`'s question view has no population to render at all.
- **D7 rests on ADR-0239, which has since LANDED — the dependency is satisfied, not pending.**
  ADR-0239 reads `status: accepted` and its implementation shipped as PR #1016: the `Arc` schema
  carries a stored `lifecycle` enum, `storytree arc close` writes the transition atomically from a
  required terminal increment, `arc list` defaults to active-only with `--all` / `--closed` widening
  it, and `lifecycleOf`'s `arc` branch reads the stored field instead of the old hardcoded
  `"active"`. D7's "currently running" is therefore answerable now. Verified 2026-08-03 in
  `packages/library/src/knowledge.ts`, `packages/library/src/lifecycle.ts` and
  `packages/cli/src/arc.ts`, not taken from the ADR's prose.

  *Why D7 was written the way it was, kept as history because it is the rationale:* when this ADR
  was drafted `arc list --pg` returned 22 arcs with **no live/closed distinction** — a finished arc
  rendered identically to a live one, because closure was prose in `endState`. A surface opening on
  22 undifferentiated arcs, most of them done, restores no context; it manufactures the confusion it
  exists to remove. Measured 2026-08-03 the default list returns **17 active**, with 15 closed behind
  `--all` — the differentiated worklist D7 needs. (This bullet previously instructed a builder to
  "re-check its landed status before depending on the verb or the filter existing", because the
  status flip had not yet reached `origin/main` when it was written. That instruction is discharged:
  the flip and the implementation are both on `main`.)
- **The infrastructure gap was real, and BOTH halves are now closed.** This bullet originally named
  two gaps and called them "another session's job". The join half was done first (increment 1, PR
  #1020): the derived arc → children join is no longer CLI-only — `deriveArcRollup` /
  `loadArcRollup` / `loadArcRollups` live in `packages/drive/src/arc-rollup.ts`, and every surface
  that answers `GET /api/arcs` + `/api/arcs/<id>` renders from that ONE value, so none of them can
  drift apart. The UI half followed (`arc-surface-lanes-and-briefing-panel`, PR #1191, under
  ADR-0314): `apps/studio/src` consumes the endpoint, and an arc is a momentum lane with a briefing
  panel rather than a flat artifact card. The desktop thick client serves the same route from its
  own re-composed backend — held to the studio's payload by a `MIRRORS` row rather than by an
  import, since ADR-0176 forbids the desktop to import the studio.
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
  stored state (`lifecycle` enum + `arc close` + default active-only `arc list`). **`accepted` and
  LANDED** (PR #1016); it is what makes D7's "currently running" answerable, and it is answerable now
  (see Consequences).
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the pull-based Library model, whose
  agent-facing CLI surface D3 leaves untouched.
- `arc-orientation-surface-arc` — the arc this ADR was produced by.
