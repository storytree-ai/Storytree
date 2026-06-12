---
id: "prove-spec-resolution"
tier: capability
story: drive-machinery
title: "Node specs, the build registry, and ProveSpec resolution"
outcome: "Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire."
status: mapped
proof_mode: integration-test
depends_on: [red-green-phase-machine, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree]
---

# Node specs, the build registry, and ProveSpec resolution

**Outcome —** Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md), [`shell-test-observer`](shell-test-observer.md), [`prove-it-gate`](prove-it-gate.md), [`owned-loop-phase-author`](owned-loop-phase-author.md), [`real-build-worktree`](real-build-worktree.md)

> **Proof status (honest) — `mapped`, with the LIVE-leaf arm as the `proposed` pocket.** The
> resolver, the spec loader, the registry, the prompts, the feedback-tool arming, and BOTH offline
> end-to-end walks (dry-run glue and the REAL-mode worktree walk with a scripted author) are
> covered by a real, passing, offline suite (`packages/orchestrator/src/resolve-prove-spec.test.ts`,
> part of `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). The pocket: the default
> live-mode author is a REAL `ClaudeAgentAuthor` — offline tests verify it is constructed and
> armed (`:452-:484`) but never run it; the genuinely-live legs are attested by the Phase D/E/F
> runs (signed passes, e.g. run `real-mq7ky4ck`), not by a standing test.

## Guidance

Three files, one act — turn a unit id into everything `proveUnit` needs:

- **`node-spec.ts`** — a LIGHT frontmatter loader for `stories/<story>/<unit>.md`
  (`loadNodeSpec`, `node-spec.ts:65-91`): validates JUST the fields the resolver needs (zod,
  unknown keys tolerated), carries the `## Guidance` prose for prompt assembly, and is LOUD on a
  missing/unterminated frontmatter block. `findNodeSpecFile` (`node-spec.ts:108-118`) locates a
  capability at `stories/<story>/<id>.md` and a story at `stories/<id>/story.md`; `mapProofMode`
  (`node-spec.ts:125-138`) maps the seed's test-kind vocabulary onto core's tier ladder.
- **`test-command-registry.ts`** — the EXPLICIT node→build-config map
  (`NODE_BUILD_REGISTRY`, `test-command-registry.ts:78-197`): for each buildable node, the REAL
  proof command and the per-phase write-scope globs; `real:` entries (ADR-0031 §2) add the REAL
  test/source files, exact-file walls, `install` and the REQUIRED-when-installed `typecheck`.
  Explicit by design — a node is buildable only once someone deliberately registers how to prove
  it; a miss is `null`, never a guess.
- **`resolve-prove-spec.ts`** — the injection layer (`resolveProveSpec`,
  `resolve-prove-spec.ts:198-275` + `resolveReal` `:282-373`), three modes:
  **dry-run** (offline, zero cost: a scripted phase-aware model behind
  [`owned-loop-phase-author`](owned-loop-phase-author.md), a temp workspace, a real Node test
  runner over a planted red→green pair — proves the GLUE, not the node's proofs);
  **live-smoke** (ADR-0030 Phase D: a REAL `ClaudeAgentAuthor` authors the synthetic pair under
  hook-enforced scope); **real** (Phase F: nothing synthetic — the registry's real files in a
  fresh git worktree, the registry's REAL proof command, and a tree seam that COMMITS the
  authored files spine-side before reading genuine `git status`, `resolve-prove-spec.ts:344-355`).
  `feedbackCommandsFor` (`:385-411`) arms the leaf's bounded ADR-0035 tools — `run_proof` spawns
  the SAME command the spine's observations spawn (one oracle, two consumers), `run_typecheck`
  only when registered. The prompt builders (`assemblePrompts` `:119-127`, `realPrompts`
  `:418-463`) splice the node's REAL outcome + guidance into the phase briefs, including the
  no-node_modules / typecheck-wall constraints.

Code edges for the `depends_on`: `resolve-prove-spec.ts:13` (`PathWriteScope`), `:14`
(`OwnedLoopAuthor`), `:15` (`ShellTestExecutor`, `runShellCommand`), `:17` (`gitTreeState`), `:27`
(`commitAuthored`, `platformShellCommand`); plus the type edges `test-command-registry.ts:1-2`
(`ShellCommand`, `PathWriteScopeConfig`). The VALUE import of `ClaudeAgentAuthor` from
`@storytree/agent` (`resolve-prove-spec.ts:3-8`) is the one place the consumed executor seam goes
concrete — deliberately HERE, in the injection layer, so the gate itself stays author-agnostic
(see the story's executor-seam section).

## Integration test

**Goal —** A REAL node spec resolves and drives through the REAL gate offline, twice over:
(1) dry-run glue — the real `library-cli` spec → ProveSpec → `proveUnit` → signed pass → rollup
`healthy` (`packages/orchestrator/src/resolve-prove-spec.test.ts:309`); (2) the REAL-mode walk —
a fresh worktree of a throwaway repo, the registry's real proof command, a scripted author via the
`authorOverride` test seam, the spine's commit, a signed pass on a genuinely clean tree
(`resolve-prove-spec.test.ts:539`).

## Contracts (10)

1. **`spec-files-locate-and-load`** — capability and story specs are found and parse to typed NodeSpecs with guidance prose
   - **asserts —** `findNodeSpecFile` resolves both layouts; real library specs load; no frontmatter is LOUD.
   - **covers —** `packages/orchestrator/src/node-spec.ts:65-118`
   - **proven by —** `packages/orchestrator/src/resolve-prove-spec.test.ts:42`, `:54`, `:67`, `:75` (REAL, passing)
2. **`proof-mode-vocabulary-maps`** — the seed's test-kind words map onto core's tier ladder
   - **asserts —** integration-test→capability, UAT→story, contract-test→contract, operator-attested shared.
   - **covers —** `node-spec.ts:125-138`
   - **proven by —** `resolve-prove-spec.test.ts:88` (REAL, passing)
3. **`registry-is-explicit`** — the registered nodes resolve to commands+scopes; a miss is null
   - **asserts —** the library story + capabilities are covered; unknown ids return null.
   - **covers —** `test-command-registry.ts:78-207`
   - **proven by —** `resolve-prove-spec.test.ts:97` (REAL, passing)
4. **`real-walls-really-wall`** — every REAL entry's write scope allows exactly its test file in AUTHOR_TEST and its source file in IMPLEMENT
   - **asserts —** the verdict-line and notice-board entries' walls hold; every install-bearing entry registers a typecheck (the registry-wide invariant).
   - **covers —** `test-command-registry.ts:97-197`
   - **proven by —** `resolve-prove-spec.test.ts:117`, `:141-:223`, `:242` (REAL, passing)
5. **`unregistered-is-not-buildable`** — resolution fails closed with the buildable ids; REAL mode additionally requires a real-proof config
   - **asserts —** both refusals carry guidance, never a guess.
   - **covers —** `resolve-prove-spec.ts:202-209`, `:287-296`
   - **proven by —** `resolve-prove-spec.test.ts:269` and `:357` (REAL, passing)
6. **`prove-spec-fields-come-off-the-real-spec`** — unitId, mapped proofMode, testId, runId, signer fill from the loaded spec
   - **asserts —** the resolved ProveSpec mirrors the node's identity.
   - **covers —** `resolve-prove-spec.ts:259-271`
   - **proven by —** `resolve-prove-spec.test.ts:287` (REAL, passing)
7. **`dry-run-glue-end-to-end`** — real spec → ProveSpec → proveUnit → signed pass → rollup healthy, offline
   - **asserts —** the whole chain over an InMemoryStore.
   - **covers —** `resolve-prove-spec.ts:215-275`
   - **proven by —** `resolve-prove-spec.test.ts:309` (REAL, passing)
8. **`real-mode-walk-earns-its-tree`** — fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree
   - **asserts —** the verdict's commitSha is the spine's commit; `git status` is genuinely clean.
   - **covers —** `resolve-prove-spec.ts:282-373`
   - **proven by —** `resolve-prove-spec.test.ts:539` (REAL, passing — via the `authorOverride` seam; the live-leaf default is the `proposed` pocket)
9. **`prompts-brief-the-real-constraints`** — the phase briefs name the real files, the real proof command, the dependency rules, and the feedback loop
   - **asserts —** authorTest/implement briefs carry outcome+guidance; REAL briefs name testFile/sourceFile, no-node_modules or typecheck walls, run_proof discipline and stop-if-test-wrong.
   - **covers —** `resolve-prove-spec.ts:119-127`, `:418-463`
   - **proven by —** `resolve-prove-spec.test.ts:257`, `:379`, `:393`, `:408`, `:424` (REAL, passing)
10. **`feedback-tools-spawn-the-same-oracle`** — `run_proof` always (the exact CONFIRM command), `run_typecheck` only when registered; armed per mode
    - **asserts —** the commands really spawn; arming matches install/no-install/live-smoke modes.
    - **covers —** `resolve-prove-spec.ts:311-323`, `:385-411`
    - **proven by —** `resolve-prove-spec.test.ts:433`, `:452`, `:470`, `:484` (REAL, passing)
