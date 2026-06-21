---
status: accepted
decided: 2026-06-12
amends: [36]
---

# ADR-0038: Story-world vocabulary recalibration — growth carries the lifecycle

## Status

accepted (2026-06-12) — direct owner feedback on the tree UI, applied the same day. **Amends
[ADR-0036](0036-story-world-studio-visualisation.md) decision 3** (the status-true visual
vocabulary) and narrows decision 6c (the legend's scope). Everything else in ADR-0036 — the hex
world, dependency-ranked layout, roads, focus interaction, signposts, wisps, advisory-honesty —
stands unchanged.

*Numbering note:* checked all remote branches for `docs/decisions/0038*` on 2026-06-12 (post-
`git fetch`) — 0037 is the latest taken; 0038 is free. (The live DB is stopped; branch refs are
the check that has caught every prior collision.)

## Date

2026-06-12

## Context

ADR-0036 d.3 mapped every `Status` to its own foliage hue (proposed = autumn orange, building =
lime, mapped = teal, healthy = deep green, unhealthy = red, retired = bare gray ghost) and kept
retired stories on the map as ghost skeletons. Operating experience with the world surfaced four
problems (owner feedback, 2026-06-12):

1. **Retired items still occupied the world.** A retired story kept its island, its roads and its
   rank influence — terminal off-tree work shaping the live map.
2. **Sapling vs proposed read as the same idea twice.** A proposed story with capabilities grew
   the same full canopy as a mapped or healthy one — only the hue differed, so "fully grown" was
   visually divorced from how far the work had actually come. The glossary already calls `mapped`
   the **brownfield** state; the world painted it teal.
3. **`building` bought nothing over `proposed`.** Live work is already signalled by session wisps
   (ADR-0033); a separate foliage hue for building just shrank the freedom to iterate that
   proposed deliberately carries.
4. **The legend explained things that explain themselves.** Roads (an arrow on a path) and the
   focus tints (hover feedback) had legend rows; both are intuitive in place.

## Decision

1. **Retired units don't render.** The world prunes `retired` stories (island, roads, rank) and
   `retired` capabilities (garden flora) before layout — `presentStories` in
   `apps/studio/src/lib/worldStatus.ts` is the one seam. The ghost-skeleton form and its CSS are
   deleted. Searching/resurrecting retired work is later, data-side work — the frontmatter and
   schema keep the status.
2. **Growth carries the lifecycle; brown means unproven.** The story tree's FORM now encodes
   progress and its COLOUR encodes proof: a **young amber tree** = `proposed` (not fully grown —
   still iterating). A claimed-but-empty story (zero capabilities) renders this SAME young form
   in its status hue rather than a distinct stage — the **sapling** form (originally ADR-0036
   d.3, problem 2 above) was folded into `young` (owner 2026-06-21), since it was visually
   indistinguishable from a zero-cap proposed tree; a **full brownfield-brown canopy** = `mapped`
   (the glossary's own word: real,
   observationally verified, not yet UAT-proven — was teal); a **full deep-green canopy** =
   `healthy` (proven through the gate); **withered** = `unhealthy` (unchanged).
3. **`building` wears `proposed` in the world.** A display-level fold (same seam as the prune):
   wisps say "being worked on", the proposed state says "still free to iterate" — one visual
   state covers both honestly. The `Status` enum and authored frontmatter keep `building`; only
   the world stops distinguishing it.
4. **The legend drops the roads and focus rows.** They are self-explanatory in place; the legend
   describes the states that need a key (trees, garden plants, proof marks, sessions,
   decoration).

## Consequences

- The status filter, panel badges, card strips and legend all speak the merged vocabulary —
  `building`/`retired` never reach them (they sit behind the `presentStories` seam, unit-tested
  in `worldStatus.test.ts`).
- The unified `--st-*` palette (PR #67) keeps one hue per *visible* status; `--crown-mapped-*`
  moved from teal to brown, and the building/retired crown pairs plus all ghost CSS are deleted.
- ADR-0036 d.3's "status-true" principle survives in weakened form: the world is still
  authored-status-true for every status it *shows*; it now deliberately under-reports
  building-vs-proposed and hides retired. Both are recoverable from the data, not erased.
- A deep link `#/tree/<retired-story>` renders the unfocused world (the existing
  stale-deep-link behaviour) — acceptable until search exists.
