---
id: "story-topo-build"
tier: capability
story: drive-machinery
title: "Topo-ordered story chaining (runStoryBuild)"
outcome: "A story's nodes drive through the gate in dependency order with the story's UAT node last and a halt never reported as a pass."
status: mapped
proof_mode: integration-test
depends_on: [halt-aware-sequence, prove-spec-resolution, prove-it-gate]
---

# Topo-ordered story chaining (runStoryBuild)

**Outcome —** A story's nodes drive through the gate in dependency order with the story's UAT node last and a halt never reported as a pass.

**Depends on —** [`halt-aware-sequence`](halt-aware-sequence.md), [`prove-spec-resolution`](prove-spec-resolution.md), [`prove-it-gate`](prove-it-gate.md)

> **Proof status (honest) — `mapped`.** Fully covered by a real, passing, offline suite
> (`packages/orchestrator/src/story-build.test.ts`, part of `@storytree/orchestrator` 99/99 —
> I ran it 2026-06-13). Brownfield `mapped`, not `healthy`.

## Guidance

Drive-machinery Phase E: a THIN topo-ordered loop over a story's nodes — prove the capabilities in
dependency order, then the story itself (contracts → capability integration → story UAT, ADR-0010's
proof ladder walked bottom-up). Deliberately NOT a rewrite of any control flow:

- **`topoOrderStoryNodes`** (`packages/orchestrator/src/story-build.ts:134-195`): Kahn's algorithm
  with an alphabetical ready-queue (same inputs ⇒ same order, always), the story LAST. Fail-closed
  on every malformed input rather than guessing: a non-story root, a listed-but-unloaded
  capability (or vice versa), a `depends_on` edge leaving the story's capability set, and a cycle
  are all refusals.
- **`runStoryBuild`** (`story-build.ts:66-118`): the loop IS
  [`halt-aware-sequence`](halt-aware-sequence.md)'s `runSequence` verbatim (`story-build.ts:3`,
  `:70` — the code edge), so the hard-won *halted-is-never-a-pass* guard is REUSED, not
  re-implemented. Each node is one step driven by the injected `StoryNodeBuilder` (the caller owns
  workspace/store/leaf wiring — that is what lets the CLI chain nodes over ONE store and runId); a
  node that fails closed halts the story at that node, later nodes never run. The TOTAL budget
  ceiling (ADR-0005's per-node-budget call at story grain) is checked fail-closed BEFORE each node
  (`story-build.ts:78-87`): once spend reaches the ceiling, the run halts with a typed
  budget-exhausted reason rather than starting another leaf, and the remaining headroom is handed
  to the builder so each slice can be capped.

The other code edges: `story-build.ts:1-2` import `ProveResult` from `./prove-it-gate.js` and
`NodeSpec` from `./node-spec.js` (type-only — the chain's vocabulary is the gate's result and the
resolver's spec shape).

## Integration test

**Goal —** A whole story chains through the real gate offline: the CLI's
`story build library --dry-run` drives every node — seven capabilities topo-ordered from real
`depends_on` frontmatter, the story's UAT node last — through real `proveUnit` walks over ONE
shared store, all signed (`packages/cli/src/story-build.test.ts:17`).

## Contracts (8)

1. **`topo-respects-depends-on-story-last`** — dependency order, alphabetical tie-break, story last
   - **asserts —** the order satisfies every edge; ties break deterministically; the story closes the run.
   - **covers —** `packages/orchestrator/src/story-build.ts:134-195`
   - **proven by —** `packages/orchestrator/src/story-build.test.ts:54` (REAL, passing)
2. **`topo-is-deterministic`** — input order never changes the drive order
   - **asserts —** shuffled inputs ⇒ identical order.
   - **covers —** `story-build.ts:169-191`
   - **proven by —** `story-build.test.ts:68` (REAL, passing)
3. **`cycles-and-escaped-edges-fail-closed`** — a dependency cycle and an edge leaving the story's capability set are refusals
   - **asserts —** each names the offender; nothing is guessed.
   - **covers —** `story-build.ts:155-167`, `:180-184`
   - **proven by —** `story-build.test.ts:81` and `:90` (REAL, passing)
4. **`set-mismatches-fail-closed`** — a listed-but-unloaded capability, an unlisted extra, and a non-story root all refuse
   - **asserts —** the three malformed-input refusals.
   - **covers —** `story-build.ts:138-158`
   - **proven by —** `story-build.test.ts:98` (REAL, passing)
5. **`all-pass-collects-in-order`** — every node signing ⇒ `passed:true`, outcomes in drive order, costs summed
   - **asserts —** the happy chain's shape.
   - **covers —** `story-build.ts:66-118`
   - **proven by —** `story-build.test.ts:118` (REAL, passing)
6. **`node-failure-halts-the-story`** — a failing node halts the run; later nodes never run; never a pass
   - **asserts —** `halted:true` at the failing index, `passed:false`, successful prefix kept.
   - **covers —** `story-build.ts:92-99` (riding `runSequence`'s guard)
   - **proven by —** `story-build.test.ts:130` (REAL, passing)
7. **`budget-wall-before-spend`** — the ceiling halts the run BEFORE the next node spends anything
   - **asserts —** budget-exhausted is a typed halt; the already-signed prefix stands.
   - **covers —** `story-build.ts:78-87`
   - **proven by —** `story-build.test.ts:148` (REAL, passing)
8. **`remaining-budget-flows-down-and-failures-count`** — the builder receives remaining headroom; a failed node's spend still counts
   - **asserts —** per-slice caps are computable; total cost includes the failure's spend.
   - **covers —** `story-build.ts:87-90`, `:116`
   - **proven by —** `story-build.test.ts:168` and `:191` (REAL, passing)
