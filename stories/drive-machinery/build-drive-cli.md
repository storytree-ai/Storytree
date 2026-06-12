---
id: "build-drive-cli"
tier: capability
story: drive-machinery
title: "The build drive CLI (node build / story build)"
outcome: "An operator drives any registered node or whole story through the gate from one CLI command and gets an honest envelope back."
status: mapped
proof_mode: integration-test
depends_on: [prove-spec-resolution, prove-it-gate, real-build-worktree, story-topo-build, oq-hygiene-gate, work-verdict-event-log]
---

# The build drive CLI (node build / story build)

**Outcome —** An operator drives any registered node or whole story through the gate from one CLI command and gets an honest envelope back.

**Depends on —** [`prove-spec-resolution`](prove-spec-resolution.md), [`prove-it-gate`](prove-it-gate.md), [`real-build-worktree`](real-build-worktree.md), [`story-topo-build`](story-topo-build.md), [`oq-hygiene-gate`](oq-hygiene-gate.md), [`work-verdict-event-log`](work-verdict-event-log.md)

> **Proof status (honest) — `mapped`, with the live arms as `proposed` pockets.** The dry-run
> walks (single node AND whole story), every mode/refusal branch, and the forged-healthy store
> wall are covered by real, passing, offline suites (`packages/cli/src/node-build.test.ts` +
> `packages/cli/src/story-build.test.ts`, part of `@storytree/cli` 110/110 — I ran them
> 2026-06-13). The pockets, all live-attested but not standing tests: the `--live` SDK smoke
> (Phase D, first signed live pass $0.06), the `--real` worktree build + promotion (Phase F,
> verdict-line run `real-mq7ky4ck`, landed via non-squash PR), the live `story build --live`
> chain (Phase E, library 8/8 signed passes $0.48), and the `--store pg` live persistence leg
> (verified once against the real `events.verdict`).

## Guidance

The operator surface over the whole machinery — two commands, one honest-envelope discipline
(every body ends in an explicit "honest framing" naming exactly what was and was not proven):

- **`node build <id>`** (`packages/cli/src/node-build.ts:299-585`): pick EXACTLY one of
  `--dry-run` (offline scripted glue walk), `--live` (ADR-0030 SDK smoke over the synthetic pair),
  `--real` (Phase F — fresh worktree, the node's REAL files and proof command, spine commit,
  ADR-0031 promotion with the typecheck/regression pre-checks and push-withhold on red). Before
  any work: a resolvable signer (a verdict must be attributable), the spec file, and — for
  `--real` — the registry's real-proof config and the install⇒typecheck invariant, each a cheap
  fail-closed refusal. `driveNode` (`node-build.ts:216-260`) is the shared single-node walk:
  building mark → resolve → `proveUnit` → cleanup, with the store/runId/signer owned by the
  CALLER — exactly what lets `story build` chain nodes over one event log.
- **`story build <story-id>`** (`packages/cli/src/story-build.ts:75-292`): loads the story + its
  listed capabilities, topo-orders them ([`story-topo-build`](story-topo-build.md)), prechecks
  EVERY node's registry entry before any node runs (and before any spend), runs the
  [`oq-hygiene-gate`](oq-hygiene-gate.md) (live only), then chains `driveNode` per node over ONE
  store and runId under the total budget ceiling (default $10, each slice capped at $1). The
  report derives per-node rollups off the one shared event log.
- **The verdict store seam** (`resolveVerdictStore`, `node-build.ts:128-187`): in-memory by
  default; `--store pg` swaps in [`work-verdict-event-log`](work-verdict-event-log.md)'s
  `PgWorkStore` over the live tables — and is REFUSED for scripted dry-runs, because persisting a
  synthetic PASS would plant a forged `healthy` in the shared event log (exactly what ADR-0020
  exists to prevent).

Code edges for the `depends_on`: `node-build.ts:15-28` (the resolver/gate/worktree surface:
`resolveProveSpec`, `proveUnit`, `createBuildWorktree`, `promoteRealPass`, `runRegressionSuite`,
`runWorktreeTypecheck`, `loadNodeSpec`, `findNodeSpecFile`, registry lookups);
`story-build.ts:5-12` (`runStoryBuild`, `topoOrderStoryNodes`); `story-build.ts:17`
(`oqHygieneGate`); `node-build.ts:8-14` (`workEvent`, `rollupStatus`, `verdictLine`) and `:36`
(`PgWorkStore`). **Cross-story (the story-level `library` edge):** `node-build.ts:36` also pulls
`createPool`/`closePool`/`applySchema` — the library story's store-connection seam. The
`ClaudeAgentAuthor` import (`node-build.ts:6`) is type-only — the consumed executor seam's
reporting surface (cost, scope walls, feedback runs — `liveLeafLines`, `node-build.ts:263-274`).

## Integration test

**Goal —** The full drive offline, both grains, against real in-story collaborators: `node build
verdict-line --dry-run` walks the REAL registered-buildable spec through the gate and reports
trail + verdict + rollup (`packages/cli/src/node-build.test.ts:17`, `:74`), and `story build
library --dry-run` chains every real library node topo-ordered, story last, all signed, over one
event log (`packages/cli/src/story-build.test.ts:17`).

## Contracts (9)

1. **`dry-run-walks-and-reports-honestly`** — the envelope carries the phase trail, the verdict line, the derived rollup, and the honest framing
   - **asserts —** trail `AUTHOR_TEST → … → GATE`, a signed verdict, rollup derived from the event log, the dry-run framing.
   - **covers —** `packages/cli/src/node-build.ts:483-585`
   - **proven by —** `packages/cli/src/node-build.test.ts:17` (REAL, passing)
2. **`exactly-one-mode`** — no mode, both modes, and `--dry-run`+`--real` are all refused with the mode menu
   - **asserts —** the xor wall across all three flags.
   - **covers —** `node-build.ts:310-331`
   - **proven by —** `node-build.test.ts:39`, `:48`, `:54` (REAL, passing)
3. **`real-prechecks-are-cheap`** — `--real` without a real-proof config fails closed BEFORE any worktree is cut
   - **asserts —** the refusal names the REAL-buildable ids; no worktree side effects.
   - **covers —** `node-build.ts:366-393`
   - **proven by —** `node-build.test.ts:63` (REAL, passing)
4. **`registered-buildable-specs-drive`** — the verdict-line spec (the REAL target) and the library story spec (UAT proof-mode mapping) both dry-run
   - **asserts —** contract and story tiers walk the same glue.
   - **covers —** `node-build.ts:346-364`, `:483-502`
   - **proven by —** `node-build.test.ts:74` and `:118` (REAL, passing)
5. **`misses-are-guidance`** — an unknown id, an unregistered spec, and a bare `node` are guidance envelopes, never throws
   - **asserts —** each lists the buildable ids / help.
   - **covers —** `node-build.ts:303-309`, `:347-354`, `:493-498`
   - **proven by —** `node-build.test.ts:85`, `:92`, `:102` (REAL, passing)
6. **`story-chain-dry-runs-end-to-end`** — `story build library --dry-run` drives every node topo-ordered, story last, all signed
   - **asserts —** the order line, per-node PASS rows with rollups, the chain outcome.
   - **covers —** `packages/cli/src/story-build.ts:75-292`
   - **proven by —** `packages/cli/src/story-build.test.ts:17` (REAL, passing)
7. **`story-prechecks-fail-closed`** — unregistered nodes refuse BEFORE any node runs; an unknown story and a capability id refuse with guidance
   - **asserts —** the three story-grain refusals.
   - **covers —** `story-build.ts:119-170`
   - **proven by —** `story-build.test.ts:64`, `:76`, `:82` (REAL, passing)
8. **`forged-healthy-store-wall`** — `--store pg` is refused for dry-runs at BOTH grains; an unknown `--store` value is refused
   - **asserts —** a scripted PASS can never persist to the shared event log.
   - **covers —** `node-build.ts:128-164`
   - **proven by —** `story-build.test.ts:90`, `:100`, `:124` (REAL, passing)
9. **`store-label-is-honest`** — the envelope header names the verdict store (in-memory vs persisted)
   - **asserts —** the dry-run header reports the in-memory store.
   - **covers —** `node-build.ts:396-402`, `:506-512`
   - **proven by —** `story-build.test.ts:133` (REAL, passing)
