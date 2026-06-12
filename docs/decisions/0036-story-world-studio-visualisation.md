---
status: accepted
decided: 2026-06-12
supersedes_in_part: [1, 11]
---

# ADR-0036: The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS)

## Status

accepted (2026-06-12, owner-steered live through PRs #54–#58 and the 2026-06-12 direction call) —
**supersedes [ADR-0001](0001-foundational-stack.md) in part** (the PixiJS v8 + `@pixi/react`
story-tree engine pick is overtaken: the shipped world is plain inline SVG in React);
**supersedes [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) §5 in part** (its
"the PixiJS studio … stands" line, the same overtaken-mention shape as its DBOS line was for
ADR-0019); **refines [ADR-0006](0006-event-store-observability-surface.md)** (the studio renders
a *composite* of read surfaces — `stories/` frontmatter, `events.verdict`, `events.session` — not
the event store alone), **[ADR-0023](0023-library-cli-choose-your-own-adventure.md)** (the
"when the story tree exists" deferral condition is now met), **[ADR-0030](0030-all-in-on-claude-agent-sdk.md)**
(this is the built form of "a human maintains observability over agent-driven work"), and
**[ADR-0033](0033-session-presence-notice-board.md)** (the CLI tree stays the agent-facing
primary; the world is a second, human-facing rendering of the same presence + verdict + tree
state, reusing decision 3's glyph semantics verbatim).

*Numbering note:* per the ADR-0027-collision lesson, `git log --all` across all branches and the
seed corpus (`assets.json` / `knowledge.json`) were checked 2026-06-12 — highest allocation found
is 0035, no parallel claim on 0036. The live-DB ref check is pending (instance stopped by
default); reconcile on next `db:up` if a collision surfaces.

## Date

2026-06-12

## Context

ADR-0030 reframed the premise: the **story tree is the research object** — how the map of
stories/capabilities/contracts helps an AI-driven SDLC *and* how a human maintains observability
over agent-driven work. Until now the only tree surfaces were textual: `storytree tree`
(ADR-0033) and the stories/ files themselves. ADR-0001 had settled the future visual tree as
"PixiJS v8 + `@pixi/react`, 2D isometric" with the look deferred.

The visual tree was then actually built (PRs #54–#58, one overnight arc), steered live by the
owner through three design reversals: a first cut of side-by-side trees was rejected ("stories
can be dependent on other stories … this forces you to scroll right"; "i was hoping for more of a
real time strategy game feel … you see the tree from top down … as the story grows, we get more
complexity around the tree (maybe it turns into a garden)"); V1's `legacy/Agentic`
visualisation was the named starting point ("not perfect but a good place to start … improve on
the existing design rather then just replicate it"); and a Dorfromantik-style hex-tile reference
image set the final look ("this is an actual game so it doesnt need to go this far"). None of
that was PixiJS — the shipped world is inline SVG, and no `pixi.js` dependency exists anywhere
in the repo.

## Decision

1. **The studio renders the work hierarchy as a world map at `#/tree` — the story world.** A
   story is a **territory** of extruded hexagonal tiles (`max(3, capabilities + 2)` tiles, so
   land grows with the story); a capability is a **planted tree whose foliage is its status**;
   story-level `depends_on` renders as **roads** (dependency → dependent); a pale unclaimed
   coast rings the land. Layout, growth, decoration and road bows are all **hashed from ids**
   (FNV-1a + one mulberry32 step) — the world renders identically on every load.

2. **Inline SVG in React is the engine; the PixiJS pick is retired.** The workload is an
   information graphic (hundreds of nodes, CSS-variable theming, native tooltips, SMIL for the
   one orbit animation), not a sprite scene; SVG ships with zero new runtime and stays
   debuggable in the DOM. PixiJS becomes **named-deferred** exactly as DBOS is (ADR-0019):
   revisit only if node counts or animation demands outgrow SVG. The capability sub-DAG in the
   side panel uses **dagre** (the V1 lesson, recorded in the V1 corpus and re-learned here:
   hand-rolled lane layouts produce edge-visibility bugs).

3. **The visual vocabulary is status-true and advisory-honest.** Foliage pairs encode `Status`
   (proposed = autumn orange, building = lime, mapped = teal, healthy = deep green, unhealthy =
   red, retired = bare gray ghost); wheat fields and conifer clumps are explicitly decorative;
   a story with `capabilities: []` renders as **claimed-but-empty land** (drive-machinery's
   honest "thinly mapped" state — an authoring signal, not a bug). Verdict badges carry
   ADR-0033 decision 3 unchanged: **✓ proven / ✗ last run failed / absent = never built**, read
   from `events.verdict`, a story showing only its OWN UAT node's verdict, never a child
   roll-up — and *absent* is deliberately indistinguishable from *offline*. Presence wisps
   orbit territories per ADR-0033's bands (fresh/stale/possibly-dead), advisory and silently
   absent. Both advisory layers ride a never-throwing `LibraryBackend` seam whose 4-second
   budget races the **pool build itself**, not just the query (PR #57's live lesson).

4. **Story-level `depends_on` frontmatter is the world's edge source, and it encodes only
   evidenced boundaries** (ADR-0010 §4: documented "Cross-story boundary" sections or actual
   code imports — never vibes). Alongside this ADR the evidenced edges are encoded:
   `studio-foundation → [library, drive-machinery, notice-board]` (store seam + node-spec/verdict
   surfaces + presence store — all live code imports in `apps/studio`),
   `feedback-graduation → [studio-foundation, library]` (its own declared-boundary section), and
   `drive-machinery → [library]` (`createPool`/`applySchema`/`Store` seam in `node-build.ts`).
   Derived cross-story *capability* deps also render (tooltip carries the `cap → dep` evidence).

5. **Selection is the route.** `#/tree/<storyId>` deep-links a focused territory (panel open,
   transitive upstream chain gold, downstream red, rest dimmed — V1's focus interaction at
   story grain); selecting navigates the hash, so any view state is shareable and reachable on
   a fresh first paint.

6. **Accepted direction — the world must read as a TREE (owner, 2026-06-12).** "It should still
   feel like a tree so the user can trace which stories are foundational/load bearing at the
   bottom middle and then it fans out as they look upwards and out." The next iteration:
   **(a)** a dependency-ranked island layout — most-depended-upon stories bottom-centre,
   dependents fanning upward and outward (the encoded `depends_on` of decision 4 is what makes
   this computable); **(b)** **one central story tree per island with a garden growing around
   it** — the big tree is the story itself, capabilities become garden flora; **(c)** a
   **legend** mapping the visual vocabulary; **(d)** failure states as **withered flora** ("dead
   plants maybe are failed tests") — ✗ last-run-failed as a dead/withered plant, unhealthy as a
   withered tree, keeping decision 3's only-signed-verdicts rule.

## Consequences

- **Stale PixiJS prose is swept with this ADR**: `apps/studio/package.json`'s "No PixiJS /
  story-tree yet" description, `Home.tsx`'s "PixiJS story-tree comes later" lede, and the
  README's framing. ADR-0002's naming rationale ("component" collides with React/PixiJS
  components) loses its PixiJS half but stands on the React half — footnote only, not edited.
  The **Library still carries the old plan** (`stack-pixijs-react-studio` techstack unit; the
  `studio` definition's "live PixiJS web IDE" wording) — those are live-DB artifacts and follow
  the library-edit ceremony (CLI against the live store, ADR-0023), deferred to an artifact
  session; the seed JSON is deliberately not hand-edited here.
- **The CLI tree (ADR-0033) is unchanged and stays the agent-facing primary**; the world is the
  human-facing rendering of the same state. The two surfaces share semantics (glyphs, bands,
  staleness thresholds) by importing the same core functions, not by convention.
- **studio-foundation's "only story / no cross-story edges" prose was stale** and is corrected
  with this ADR — the story now declares its consumed boundaries the way notice-board does.
- **Capture-tooling note** (recorded for future sessions): CDP `Page.captureScreenshot` stalls
  when the browser window is occluded (rAF paused, no composited frames) and queues all later
  CDP commands behind it — looks like a frozen page, is not. Deep links (decision 5) exist
  partly so every view state is screenshot-able on a fresh first paint.

## What this does NOT decide

- **The `library → notice-board` candidate edge.** `library-cli`'s shim (`main.ts`/`commands.ts`)
  imports `PgPresenceStore`/`noticeboard` code, but the coupling was authored as notice-board's
  `ambient-integration` weaving INTO the shared CLI — whether to model it as a library
  dependency is an **owner call**, surfaced not encoded.
- **Art direction beyond SVG primitives** (no asset pipeline; the low-poly look is hand-drawn
  paths) and **live updates** (the world renders on load; polling/streaming is future work).
- ~~**The ranked-layout algorithm** for decision 6a (longest-path ranking vs dagre at story grain
  vs radial) — the iterating session picks what reads best.~~ *Picked with the decision-6 build
  (2026-06-12): longest-path rank over the declared ∪ derived edge set (the same set the roads
  render, so no road ever points downward), rank rows stacked bottom-up, within-row order by
  dependency barycenter (foundation row centre-out by transitive dependent count), and a lone
  island on a rank swings to an alternating side so chain edges read as separated diagonals (the
  owner's "dbt-style DAG" steer) instead of stacking into one vertical corridor.*

## References

- [ADR-0001](0001-foundational-stack.md) — the superseded PixiJS engine pick.
- [ADR-0006](0006-event-store-observability-surface.md), [ADR-0010](0010-three-tier-work-hierarchy.md) §3–4,
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the named-deferred pattern),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md), [ADR-0030](0030-all-in-on-claude-agent-sdk.md),
  [ADR-0033](0033-session-presence-notice-board.md) (glyph + presence semantics reused verbatim).
- `legacy/Agentic/visualisations/storytree/` — the V1 lineage (dagre layout, focus highlighting,
  ghost-retired) the world ports conceptually.
- PRs #54–#58 (2026-06-12) — the shipped arc; PR #57 for the advisory-probe race lesson.
- Owner conversation, 2026-06-12 — the RTS/garden steers, the Dorfromantik reference image, and
  the tree-shape / single-tree-island / legend / withered-flora direction quoted in decision 6.
