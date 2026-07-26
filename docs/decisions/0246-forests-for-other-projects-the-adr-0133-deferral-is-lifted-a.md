---
status: accepted
decided: 2026-07-26
amends: [133]
arc: foreign-project-forest-arc
---
# ADR-0246: Forests for other projects: the ADR-0133 deferral is lifted and scoped as its own arc

## Status

accepted (2026-07-26) — directed by the owner in conversation on 2026-07-26. Design-time alignment IS
the ratification (ADR-0110); no second end-of-flow ask.

The owner asked what it would take to grow a forest for another project and what gap had to close,
weighed the answer against the just-landed distribution posture (ADR-0244), and closed it: *"land the
arc for this then."* Chartering the arc IS the decision to scope the work, which is precisely what
ADR-0133 §5 says is not scoped. This ADR records that lift so the load-bearing set stays true.

**Amends** ADR-0133 — §5's *"No work is scoped to it here"* no longer holds; work is now scoped, as
`foreign-project-forest-arc`. ADR-0133 §1 (finish storytree's own tree first) is **not** reversed:
this lifts a deferral, it does not re-prioritise. Relative priority remains an owner call.

## Context

ADR-0133 §5 recorded the north star — storytree *"grows a fresh tree or maps an existing brownfield
project for other developers"* — and deferred it explicitly: *"No work is scoped to it here (no local
self-contained store, no multi-tenant model)."* That was true for thirteen ADRs. Two things have since
changed it.

**ADR-0244 answered the hardest structural question by accident.** Its D6 makes local-only mode
first-class — the user hosts their own Postgres, behind a mode fork in the `createPool` seam — and its
D7 re-scopes the API seam and DB authorization to the contributor/hosted deployment only, explicitly
*"not the product's protection story."* Together these settle the tenancy question that would otherwise
have gated this work: **the tenancy boundary is the machine, not a column.** And D3 cuts `stories/**`,
`docs/decisions/**`, and the ADR-0181 pinned worktree from a user build — which removes the storytree
checkout the app currently requires, and therefore *forces* the root parameterisation this arc needs.

**But ADR-0244's arc does not reach the tree.** `distribution-posture-arc`'s end state promises a user
can *"run their own forest against their own Postgres"*, while its enumerated not-started work — the
`createPool` mode fork, the seed split, Tier-0 packaging, the D4 update stream — delivers a forest
*instance* on a user's machine. The tree inside it is still ours. That gap is what this arc owns.

### What was measured

Grounded in the checkout at `8afabd5c`, not assumed:

- **There is no tenancy dimension anywhere.** `project_id` / `tenant_id` / `workspace_id` / `corpus_id`
  return zero matches across `packages/` and `apps/`. (ADR-0077's "tenant drawers" means table-family
  within one DB, not multi-customer — an easy false positive.)
- **Every repo root is derived from the module's own location, and none is a parameter.**
  `resolveStudioPaths` (`apps/studio/server/apiRouter.ts:114`), `repoRoot()`
  (`packages/cli/src/commands.ts:206`), `packages/cli/src/check-boundaries.ts:64`, `dataPath()`
  (`packages/library/src/store/load-corpus.ts:41`), `packages/cli/src/build-agents.ts:29`,
  `packages/cli/src/build-claude-md.ts:25`. `/api/tree` takes no project parameter and its payload
  carries no project field.
- **The render core is already project-agnostic, and is proven so.** `SceneInput` / `buildScene`
  (`packages/forest-world/src/scene.ts`) have no store, node, or React dependency, and the public
  website drives the same geometry from its own locally-declared `Story` / `Capability` types
  (`web/src/lib/world.ts`) with no corpus and no `/api/tree`. ADR-0093 fenced the core to the look and
  only the look.
- **Status is non-authorable, so a foreign tree is born grey.** Green comes only from a signed verdict
  (ADR-0020 / ADR-0040). A fresh corpus in another repo renders entirely `mapped` / `proposed` until
  the prove-it-gate runs and signs against that project's own commands.
- **Proof commands are already per-node data, not global config.** They live in story frontmatter
  (`stories/forest-world/story.md:128` → `pnpm --filter @storytree/forest-world test`), which makes the
  proof leg tractable rather than architectural.
- **The corpus is coupled to this repo in three concrete places**: story frontmatter cites ADR
  integers (`decisions: [68, 75, …]`) resolved against `docs/decisions/` and the global
  `events.adr_number` allocator; `check:boundaries` validates story ids against `repo-manifest.json`'s
  organism ownership; and prose bodies link `../../docs/decisions/` by relative path.
- **The closest existing "pick a repo" machinery does not repoint the tree.**
  `apps/desktop/src/backend/repo-selection.ts` and `stories/terminal-repo-picker/` thread a
  user-chosen directory into the embedded terminal's pty cwd only — not `storiesDir`, not the docs
  dir, not the store. `STORYTREE_DESKTOP_RUNTIME` (ADR-0181) names a pinned worktree of storytree
  itself.

## Decision

**D1 — ADR-0133 §5's deferral is lifted; the north star is scoped work.** It is tracked as the
`foreign-project-forest-arc` initiative, chartered by this ADR. ADR-0133 remains `accepted` and
`load_bearing`; only §5's scoping sentence is amended, and its §1 priority is untouched.

**D2 — It is a separate arc from `distribution-posture-arc`, on a stated boundary.**
`distribution-posture-arc` owns the **deployment**: how a forest instance reaches a user's machine and
runs there — packaging, the `createPool` mode fork, the seed split, the update stream. This arc owns
the **tree inside it**: where a foreign project's stories come from, and how they reach a signed
green. The boundary is recorded so the two do not re-litigate scope per increment. Shared
prerequisites (root parameterisation most obviously) land once, under whichever arc reaches them
first, and the other consumes the result.

**D3 — Multi-tenancy is not the mechanism; deployment-per-forest is.** Inherited from ADR-0244 D6/D7
and restated here so this arc cannot re-open it: no tenant column, no shared-DB project key, no
per-project database on our Cloud SQL instance. One forest, one Postgres, one deployment. The
consequence is that the globally-unique constructs — the `node_claim_work_excl` unique index on
`unit_id` and the `events.adr_number` counter (`packages/library/src/store/schema.sql`) — are correct
*within* one forest and stay exactly as they are. ADR-0244 D8's standing constraint also applies
unchanged: no Cloud SQL grant outside the inner circle.

**D4 — The render core is out of scope and stays fenced.** It is already portable; no increment of
this arc modifies `packages/forest-world` to accommodate a foreign project. If a foreign tree cannot
be rendered by the existing core, that is a data-shaping bug in the caller, not a core change
(ADR-0093).

**D5 — The proof leg is inside the arc, not deferred out of it.** A tree that cannot reach a signed
green is a picture, not a forest. The arc is not closed on a rendered foreign repo; it closes when a
foreign project's node goes green through the prove-it-gate on that project's own proof command. This
is stated as a decision because the cheap close — map a repo, render it grey, declare victory — is the
obvious failure mode.

**D6 — Three forks are named and deliberately left open**, to be settled at increment time by a plan
or a child ADR under this arc, not here:

- **fresh-tree authoring vs brownfield mapping** as the first increment — ADR-0133 §5 names both, and
  they have different first users;
- **what replaces ADR-integer `decisions:` refs** for a project that has no `docs/decisions/`;
- **whether `repo-manifest.json` and the boundary checks become per-project or optional** outside
  storytree.

## Options weighed and rejected

- **Fold this into `distribution-posture-arc`** — rejected: that arc's increments are deployment
  mechanics with a settled posture behind them, and this work's open forks (D6) are about *content*.
  Merging them would bury the tree question inside a packaging queue, which is how it stayed invisible
  until now.
- **Charter the arc without an ADR** — rejected: ADR-0133 is `load_bearing: true` and says in terms
  that no work is scoped here. Leaving that sentence standing beside an active arc is exactly the
  calibrate-to-a-stale-body trap the decision log exists to prevent.
- **Edit ADR-0133 §5 in place** — rejected: lifting a deferral is a substantive re-decision, which is
  copy-on-write (ADR-0086) and an `amends` edge (ADR-0139), not an in-place body edit.
- **Wait until storytree's own tree is finished, per ADR-0133 §5's original condition** — rejected on
  the owner's direction. The condition was written before ADR-0244 settled the tenancy and
  distribution posture; the work it was protecting against (a speculative multi-tenant model) is now
  explicitly not the mechanism.

## Consequences

**Good**
- The load-bearing set stays true: a reader of ADR-0133 §5 now finds the edge to this ADR rather than
  a stale "not scoped" that an active arc contradicts.
- The tenancy question does not get re-derived per increment — D3 pins it to ADR-0244's answer.
- The seam between deployment and tree is named (D2), so neither arc silently absorbs the other's
  work.

**Bad / accepted**
- A second active arc competes for attention with `distribution-posture-arc`, and the two share
  prerequisites. Sequencing is a plan-time concern and is not solved here.
- D6 leaves the arc's first increment genuinely undecided, so this ADR charters without scoping any
  increment. That is the honest state: the forks need a plan and a first user, not a guess.
- Nothing here changes storytree's own priority. If the owner wants this arc to wait behind ADR-0133
  §1, it waits — chartered and idle is a legitimate state.

## References

- ADR-0133 §5 — the deferred north star this amends; §1's priority is untouched.
- ADR-0244 — the distribution posture; D3 (history cut from a user build), D6 (local-only mode / the
  `createPool` mode fork), D7 (API seam scoped to the contributor deployment), D8 (the Cloud SQL grant
  constraint).
- ADR-0093 — the shared render core fenced to the look, which D4 relies on.
- ADR-0020 / ADR-0040 — green comes only from a signed verdict, which is why D5 is inside the arc.
- ADR-0110 — owner-directed decisions are born `accepted`.
- ADR-0183 — arcs and plans; the `arc:` provenance stamp on this ADR.
- ADR-0181 — the pinned-`main` runtime worktree that ADR-0244 D3 cuts.
- `packages/forest-world/src/scene.ts`, `web/src/lib/world.ts` — the already-portable render core.
- `packages/library/src/store/schema.sql` — the globally-unique constructs D3 leaves in place.
