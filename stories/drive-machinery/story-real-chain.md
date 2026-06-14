---
id: "story-real-chain"
tier: capability
story: drive-machinery
title: "Whole-story REAL chain (story build --real)"
outcome: "A story's capabilities grow to signed verdicts: real-built in dependency order over one shared worktree, then promoted once (the story's own UAT node still awaits a human witness, or expansion E)."
status: mapped
proof_mode: integration-test
depends_on: [story-topo-build, real-build-worktree, spec-borne-proof-config]
decisions: [5, 20, 30, 31, 57]
---

# Whole-story REAL chain (story build --real)

**Outcome —** A story's capabilities grow to signed verdicts: real-built in dependency order over one
shared worktree, then the proven chain is promoted once. (A `--real` story's own UAT node has no
`real:` arm, so it is withheld for a human witness, or refused for a machine witness — see below.)

**Depends on —** [`story-topo-build`](story-topo-build.md), [`real-build-worktree`](real-build-worktree.md), [`spec-borne-proof-config`](spec-borne-proof-config.md)

> **Proof status (honest) — `mapped`, built outer-loop (the bootstrap).** ADR-0057 §3's expansion D —
> no new ADR (it ships under §3 + [ADR-0031](../../docs/decisions/0031-real-pass-promotion-and-worktree-deps.md), which named "chaining promotion through `story build --real`"
> as future work; a one-sentence Consequences amendment to 0031 records that D landed). The chain
> wiring (topo order over ONE worktree, intra-story dependency resolution, halt-is-never-a-pass,
> promote-once at the stacked HEAD, halt-parks-the-prefix-local-only, the real-buildability precheck,
> mode exclusivity) is observationally verified by a real, passing, OFFLINE suite
> (`packages/cli/src/story-real-build.test.ts` — fixture git repos + fixture stories + scripted
> leaves; the spine's own commit + promotion seams run for real). The LIVE multi-node chain with the
> SDK leaf is operator-attested, like every other live leg. `mapped`, not `healthy`: D is itself a
> multi-file change the single-file inner loop cannot yet drive (it awaits expansion C). The honesty
> walls of [`prove-it-gate`](prove-it-gate.md) hold PER NODE unchanged — D orchestrates the chain; it
> never reaches inside `proveUnit`.

## Guidance

`story build --live` chains *live-smoke* per node (the synthetic add(2,3) pair in a temp workspace) —
it proves the CHAIN, not real work. D adds `story build --real`: each capability is authored for real
and signed, so the whole story grows to signed verdicts in one dependency-ordered run.

The change, no orchestrator code (the spine's `runStoryBuild`/`runSequence` are reused verbatim):

- **`node-build.ts`** — the single-node REAL lifecycle is extracted into `buildNodeReal` (resolve →
  `proveUnit` → spine commit → ADR-0031 backstop + promotion) and the two real-mode prechecks into
  `realConfigRefusal`, both SHARED with the chain so `node build --real` and `story build --real`
  behave identically per node. `buildNodeReal` measures "nothing authored" against the node's
  `baseSha` (the HEAD it entered at), never the stale original worktree cut.
- **`story-build.ts`** — the `--real` arm: ONE shared worktree for the whole chain (each node authors
  + the spine commits into it in dependency order, so a later node sees earlier nodes' committed
  source — a fresh-per-node worktree could not resolve intra-story deps); `buildNodeReal` per node
  with `promote: false`; a `currentHead` accumulator advances on each pass. After the chain greens,
  the proven chain is promoted ONCE at the stacked HEAD (`promoteRealPass`, ADR-0031) — every node's
  verdict commit is an ancestor of the one branch; land via a NON-SQUASH PR. `runStoryBuild` carries
  topo order + halt-is-never-a-pass + the total budget; `--store pg` and the UAT-withhold compose
  unchanged.

Worktree strategy (the decisive call): ONE shared worktree (stacked commits), so the topo order is
load-bearing — node *k* builds against the committed result of nodes 1..*k*−1. The cost: nodes are
coupled through shared git/fs state (temporal isolation via the per-phase write walls + the
spine-commit boundary, not spatial isolation); a stray out-of-scope file is walled deny-by-default
and would show in the promoted PR diff. Install is story-grain (installed once iff ANY driven node
declares install); a no-install node briefed "NO node_modules" while running in an installed worktree
is a minor, SAFE honesty relaxation (the write wall, not the install boundary, is the real guard; the
chain-end typecheck/regression + CI catch the rest).

A `--real` story's UAT node has no `real:` arm (its proof is a UAT, not a test-file red→green): a
human-witnessed story WITHHOLDS it (the capabilities are still real-built + promoted — the main
`--real` success shape); a machine-witnessed story whose UAT node lacks a `real:` arm is REFUSED
before any worktree (a story UAT as a gate-as-proof node is expansion E, ADR-0057 §5).

> **Open owner calls (surfaced, not decided).** (1) Should a green partial PREFIX of a halted chain
> be a LANDING candidate (pushed), not just parked local-only? D takes the conservative reading of
> ADR-0031's preservation-over-loss (parked local-only, never pushed); the inverse reverses D's halt
> policy and earns its own ADR. (2) Whole-story PR shape: D commits to ONE branch / one non-squash
> PR; per-node landing granularity re-opens ADR-0031's floated fork. (3) `--real`'s default budget
> ($10, inherited from `--live`) may be low for a multi-node real chain — surfaced in `storyHelp`,
> not changed unilaterally. All three are owner calls in the deferred-approval-gated-trunk family.

## Integration test

**Goal —** `story build --real` drives a story's capabilities through the REAL gate in dependency
order over ONE shared worktree (a later node builds on an earlier node's committed source), halts on a
fail-closed node (later nodes never run), promotes a green chain ONCE at the stacked HEAD, and parks a
halted chain's proven prefix LOCAL-ONLY — proven offline against fixture git repos with scripted
leaves; the live SDK chain is operator-attested.

## Contracts (6)

1. **`real-chain-drives-topo-over-one-worktree`** — the capabilities drive topo-ordered over ONE shared worktree, each signed
   - **asserts —** a 2-capability story reaches "capabilities PASSED (2/2 signed)" over one worktree; each rollup healthy off one event log.
   - **covers —** `packages/cli/src/story-build.ts` (the `--real` arm), `node-build.ts` (`buildNodeReal`)
   - **proven by —** `packages/cli/src/story-real-build.test.ts` ("--real chains capabilities …") (REAL, passing)
2. **`intra-story-deps-resolve`** — a later node imports an earlier node's spine-committed source and proves green
   - **asserts —** cap-b's test imports cap-a's source and passes (impossible under a fresh-per-node worktree); the promoted tip stacks both node commits on the cut.
   - **covers —** `story-build.ts` (the shared-worktree `currentHead` accumulator)
   - **proven by —** `story-real-build.test.ts` ("--real chains …", "--real promotes ONCE …" stacked-count) (REAL, passing)
3. **`real-chain-halt-is-never-a-pass`** — a node failing closed halts the chain; later nodes never run
   - **asserts —** a bad node halts at its position; the later node "never ran"; the envelope is not ok and offers no landing candidate.
   - **covers —** `story-build.ts` (reuses `runStoryBuild`/`runSequence`)
   - **proven by —** `story-real-build.test.ts` ("--real HALTS the chain …") (REAL, passing)
4. **`real-chain-promotes-once-at-stacked-head`** — a green chain promotes ONE branch at the stacked HEAD
   - **asserts —** exactly one `claude/real/<story>-<run>` branch (not one per node); pushed to the (fixture) origin; the tip is the stacked HEAD; a NON-SQUASH PR is offered.
   - **covers —** `story-build.ts` (the end-of-chain `promoteRealPass`), `build-worktree.ts` (`promoteRealPass`, unchanged)
   - **proven by —** `story-real-build.test.ts` ("--real promotes ONCE …") (REAL, passing)
5. **`real-chain-halt-parks-prefix-local-only`** — a halted chain's proven prefix is parked LOCAL-ONLY, never pushed
   - **asserts —** a local prefix branch exists but never reaches origin; no `gh pr create` is offered (a partial story is not a landing candidate).
   - **covers —** `story-build.ts` (the halt-park branch, `push: false`)
   - **proven by —** `story-real-build.test.ts` ("--real HALT parks the proven prefix LOCAL-ONLY …") (REAL, passing)
6. **`real-precheck-and-mode-exclusivity`** — every driven node must be real-buildable (before any worktree); modes are exclusive
   - **asserts —** a story with a non-real-buildable driven node is refused before any worktree; `--real` with `--dry-run` is refused, the menu naming all three modes.
   - **covers —** `story-build.ts` (the real precheck via `realConfigRefusal`, the mode-pick)
   - **proven by —** `story-real-build.test.ts` ("--real refuses a story …", "--real is refused alongside --dry-run") (REAL, passing)
