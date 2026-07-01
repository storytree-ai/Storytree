---
id: "remove-text-selection-anchoring"
tier: capability
story: library-review
title: "The old text-selection / quote anchoring is removed — a clean swap"
outcome: "The text-selection / quote anchoring is gone: `annotate.ts` quote-matching, the select-to-highlight popover in `useAnnotations.tsx`, the `kind:'text'` comment anchor, and the range `<mark>` highlights are deleted; the studio suite + typecheck stay green and no text-anchor path remains — a clean swap to block-position placement, not two systems side by side."
status: proposed
proof_mode: integration-test
# GLUE — no `--real` arm. This capability has NO isolatable red→green test of its own: deleting dead
# code does not introduce a behaviour to drive from RED to GREEN. Its proof is "the suite stays green
# AND the text-anchor path is gone" (the owner's stated bar) — an orchestrator-supplemented step
# (CLAUDE.md: the orchestrator supplements glue/removal with its own subagents), verified by the
# existing studio suite + typecheck + a grep-style absence assertion, NOT by a node-borne `real:` proof
# config. So this file carries NO `proof:` block (no dry-run/real config) — it is not inner-loop
# `--real`-buildable by design (ADR-0057: only caps with a node-borne proof config are inner-loop
# buildable; this one deliberately is not).
depends_on: [inline-comment-thread, collapsed-suggestion-view]
---

# The old text-selection / quote anchoring is removed — a clean swap

**Outcome —** The text-selection / quote anchoring is gone: `annotate.ts` quote-matching, the
select-to-highlight popover in `useAnnotations.tsx`, the `kind:'text'` comment anchor, and the range
`<mark>` highlights are deleted; the studio suite + typecheck stay green and no text-anchor path
remains — a clean swap to block-position placement, not two systems side by side.

**Depends on —** [`inline-comment-thread`](inline-comment-thread.md),
[`collapsed-suggestion-view`](collapsed-suggestion-view.md) — the REPLACEMENT surfaces must exist and
be green before the old commenting path is deleted, or the surface is left unable to comment. This is
the last cap in the story's build order for exactly that reason (the dependency graph drives it last).

> **Proof status (honest) — NOT BUILT, `proposed`. GLUE, not leaf.** This is a deletion + cleanup, not
> a new behaviour. There is nothing to drive RED→GREEN — the proof is the suite STAYING green after the
> dead code is removed AND the text-anchor path being demonstrably absent. The owner wants the dead code
> GONE (a clean swap), not two systems side by side.

## Guidance

WHY THIS IS GLUE, NOT A LEAF-PROVABLE CAPABILITY (and why it is its OWN capability anyway). Removing dead
code introduces no behaviour an isolated red→green test could drive — there is no failing assertion that
"the code is not yet deleted" makes fail and the deletion makes pass (the missing-symbol red model
doesn't fit a deletion). So this cap carries NO node-borne `real:` proof config and is NOT inner-loop
`--real`-buildable (ADR-0057) — it is orchestrator-supplemented (the session-orchestrator supplements
glue/removal with its own subagents, CLAUDE.md). It is nonetheless its OWN capability (not folded into
caps 7/8) because the owner named it a distinct deliverable with its own bar — "the suite stays green
AND the text-anchor path is gone" — and making the clean-swap removal a visible unit is the honest way
to ensure the dead code is actually deleted rather than left dangling beside the new system.

WHAT GETS DELETED (the clean swap — ADR-0140). The whole text-selection / W3C text-quote machinery:
- **`apps/studio/src/lib/annotate.ts`** — the quote-matching + highlighting engine: `computeTextAnchor`,
  `findQuoteRange`, `applyHighlights`, `clearHighlights`, `wrapRange`, the text-map walkers,
  `textAnchorFrom`, the `GutterTick` machinery. The whole file goes (or is reduced to nothing the new
  system needs).
- **The select-to-highlight popover in `apps/studio/src/lib/useAnnotations.tsx`** — the `onMouseUp`
  selection capture, the colour popover, the `<mark>` hovercard, the gutter ticks, `commit` →
  `textAnchorFrom`. The hook's text-selection path goes; whatever block-position wiring the new thread
  (cap 7) needs is NOT this — the new surface owns its own wiring.
- **The `kind:'text'` comment anchor** — already removed from the stored model in cap 1
  (`block-position-comment-anchor`); this cap removes its remaining FRONTEND consumers (the
  `c.anchor.kind === 'text'` branches, the `quote`/`prefix`/`suffix`/`color` reads, `DEFAULT_HIGHLIGHT`
  / `HIGHLIGHT_COLORS` usage tied to text anchors).
- **The range `<mark>` highlights** — the `mark.st-hl` injection + its CSS, the gutter, the heading
  badges tied to text/section comment counts driven by the old path.
- **The right-panel `CommentPanel.tsx`** — to the extent the inline thread (cap 7) replaces it; if any
  of it survives as a non-Review surface, that is a flagged judgement call (see open call below), but
  the text-selection composer path within it goes.
- **`annotate-topic`'s text-anchor CONTRACTS in the `studio` story** — those `at-*` contracts
  (`at-text-anchor-from-selection`, `at-refind-quote-*`, `at-apply-highlights-*`, etc.) describe code
  that no longer exists. Retiring them is a `librarian-curator` reconciliation of the `studio` story
  AFTER this lands (the story's open call #3), surfaced — NOT done in this cap's removal.

THE BAR (the owner's stated proof). Two conditions, both checked:
1. **The suite stays green** — `pnpm --filter studio test` + `pnpm --filter studio typecheck` pass after
   the removal (nothing that survives imports the deleted symbols; the new surfaces carry the
   commenting behaviour the old tests used to).
2. **The text-anchor path is gone** — a search of `apps/studio/src` finds no `computeTextAnchor` /
   `findQuoteRange` / `applyHighlights` / `mark.st-hl` / `kind === 'text'` / `textAnchorFrom`
   (the removed surface is absent, not merely unreferenced behind a flag). The build of the studio dist
   carries none of it (the story's UAT leg 9 checks the BUILT studio).

NO TWO SYSTEMS SIDE BY SIDE (the load-bearing constraint). The point is a CLEAN swap: block-position
placement REPLACES text-selection anchoring; the old code is deleted, not left dormant beside the new.
A removal that left `annotate.ts` importable "just in case" would fail the bar — the owner wants the
dead code gone.

## Integration test

**Goal —** Prove the clean swap: after the text-selection / quote anchoring is removed, the studio suite
+ typecheck stay green AND no text-anchor path remains in `apps/studio/src` (or the built dist) — block
placement is the only commenting model, no two systems side by side.

This is GLUE — its "integration test" is the orchestrator-supplemented verification, not an isolated
red→green unit. It would:

1. Run `pnpm --filter studio test` → green (the replacement surfaces, caps 7/8, carry the commenting +
   suggesting behaviour; nothing imports the deleted symbols).
2. Run `pnpm --filter studio typecheck` → green (no dangling references to `annotate.ts` /
   `useAnnotations.tsx` text-selection exports / the `kind:'text'` anchor).
3. Search `apps/studio/src` for the removed surface — `computeTextAnchor`, `findQuoteRange`,
   `applyHighlights`, `clearHighlights`, `textAnchorFrom`, `mark.st-hl`, `c.anchor.kind === 'text'` —
   assert NONE remain (the clean-swap absence; the story's UAT leg 9).
4. (Operator-witnessed, story UAT) the running studio's commenting works through the inline thread (cap
   7) and suggestions (cap 8) — the replacement is functional, so the removal left no gap.

## Contracts (0 — GLUE)

This capability has **no contracts** — it is a deletion + cleanup, not a set of test-proven leaf
behaviours. There is no isolated unit assertion to author for "dead code is removed"; the bar is the
suite staying green plus the absence of the text-anchor path (above), verified by the orchestrator, not
by a `node:test` / vitest contract. (Contrast every other cap in this story, which carries contracts
for a behaviour it ADDS; removal adds nothing to assert in isolation.)

## Guidance — how the orchestrator lands this

The orchestrator supplements this glue removal with its own subagent (CLAUDE.md: glue/removal is
orchestrator-supplemented, not inner-loop `--real`-driven). The sequence:

- **Land it LAST** (the `depends_on` order): only after caps 7 (`inline-comment-thread`) + 8
  (`collapsed-suggestion-view`) are green can the old commenting path be deleted without leaving the
  surface unable to comment.
- **Delete the dead code** — `annotate.ts`, the text-selection path in `useAnnotations.tsx`, the
  `kind:'text'` frontend branches, the `<mark>` highlight injection + CSS, the right-panel composer path
  in `CommentPanel.tsx` (to the extent cap 7 replaced it).
- **Verify the bar** — `pnpm --filter studio test` + `pnpm --filter studio typecheck` green, AND the
  grep-style absence of the text-anchor symbols in `apps/studio/src` (and the built dist for UAT leg 9).
- **Surface the `studio`-story reconciliation** — the dead `annotate-topic` text-anchor contracts are a
  `librarian-curator` job AFTER this lands (the story's open call #3); flag it, do not do it here.

Rules:

- **Clean swap, no dormant duplicate** — delete the old path; do not leave it importable beside the new
  system. The bar fails if `annotate.ts`'s text-quote machinery still exists.
- **Green is preserved, not newly earned** — the proof is the suite STAYING green after removal (the
  replacement surfaces carry the behaviour), plus the absence of the text-anchor path. No `--real`
  red→green (there is no behaviour to drive).
- **Land last** — the replacement surfaces (caps 7/8) must be green first, or the removal leaves a gap.
- **Reconciliation is a follow-on** — retiring `studio`'s dead text-anchor contracts is the
  `librarian-curator`'s, AFTER this lands. Surface it; do not do it in this pass.
