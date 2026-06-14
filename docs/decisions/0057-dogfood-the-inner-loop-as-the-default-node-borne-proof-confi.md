---
status: accepted
decided: 2026-06-14
---
# ADR-0057: Dogfood the inner loop as the default; node-borne proof config is the keystone expansion

## Status

accepted (2026-06-14) — direct owner decisions made 2026-06-14 in the exploration session the steer
[[inner-loop-for-everything]] opened. The **direction** is decided here; the keystone **code** is the
next unit, authored as a `drive-machinery` capability (below) and built outer-loop first (the
bootstrap caveat). Full findings: [`docs/research/inner-loop-capability-envelope.md`](../research/inner-loop-capability-envelope.md).

## Context

The infrastructure phase is done; we are dogfooding storytree on itself
([ADR-0030](0030-all-in-on-claude-agent-sdk.md): the human owns the outer loop, the spine+leaf drive
the inner loop). The owner's steer: **the inner loop should be used for everything**, and when it
*can't* express a kind of work that is a problem to raise as a decision to expand it — not a reason
to fall back silently to the outer-loop merge ceremony (which produces no node, no signed verdict, no
wisp — [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md)).

The findings doc maps the inner loop's current envelope precisely. In one sentence: it can drive **a
single net-new TypeScript behaviour, proven by one `node:test` file that goes red→green, after a
human hand-registers its test/source/scope** in `NODE_BUILD_REGISTRY`
([test-command-registry.ts](../../packages/orchestrator/src/test-command-registry.ts)) — and nothing
else. A gap audit of the last ~13 landed PRs found **none** could have gone through the inner loop
end-to-end; the closest four had a clean net-new module at their core but each also carried dispatch
wiring, an ADR, CLAUDE.md, CI yaml, or generated artifacts the loop structurally cannot touch.

The forces in play (deduped gaps G1–G11 in the findings doc):

- **The registration break (G5).** "How to prove a node" lives in orchestrator *code*, separate from
  the node's own spec, and must be hand-added per node — so even a perfectly authored story can't be
  built without an orchestrator PR. This is the structural break in the owner's hypothesised
  **decision → story-author → registered node → leaf build → signed verdict** bridge.
- **Narrow proof surface (G1–G3).** Only `node --import tsx --test` over a single TS file pair;
  no other proof commands, no multi-file changes, no edits to existing source.
- **Authoring isn't buildable (G6/G7).** Docs, ADRs, library edits, and story specs — the very
  bootstrap surface — have no proof mode.
- **Landing still rides the outer loop (G11).** Even a `--real` PASS is promoted to a branch and
  merged by the PR/CI rail ([ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)/[ADR-0022](0022-ci-green-gate-and-auto-merge.md)).

The `drive-machinery` story already names the keystone in its own Open modeling call #5
("*registering them … would make the machinery self-driveable*"); this ADR turns that observation
into a decided direction.

## Decision

1. **The inner loop is the default for all work.** Going forward, work is registered as a node and
   driven to a signed verdict through the prove-it-gate; a capability gap is **raised as an expansion
   decision**, never used to justify a silent outer-loop fallback. The outer-loop merge ceremony is
   demoted from default to the **landing rail** (point 4) and the bootstrap allowance (point 6).

2. **Keystone — node-borne proof config (self-registering nodes).** Move the per-node proof config
   (proof command + per-phase write scope, today's `RealProofConfig`) **out of the hand-maintained
   orchestrator registry and into the node's own spec/frontmatter.** Authoring a node then *makes it
   buildable* — no orchestrator PR. The registry becomes a validation/fallback layer, not the source
   of truth. This dissolves G5 and is the load-bearing plank of the bridge.

3. **Staged expansion plan (owner-ordered):**
   - **A — node-borne proof config** (this ADR's keystone; dissolves G5).
   - **B — proof-mode vocabulary beyond `node:test`**: a node declares its proof command
     (`pnpm --filter x test`, vitest, a `check:*` gate, a shell test) + scope; dissolves most of G1.
   - **D — `story build --real`**: chain `--real` node builds in topo order so a whole story grows to
     signed verdicts; dissolves G8 and makes the bridge demonstrable end-to-end.
   - **C — multi-file & existing-source builds**: widen scope to a glob *set* and support the
     "edit existing source + add a regression test" red→green; dissolves G2+G3.
   - **E — authoring as proof-bearing work** (own ADR, see point 5).

4. **Landing stays on the PR/CI rail.** "Inner loop for everything" means *every change becomes a
   registered node → signed verdict → wisp, and then the thin PR/CI rail lands it.* The
   approval-gated-trunk question (pulling trunk landing inside the loop) is **explicitly deferred** —
   not adopted by this ADR.

5. **Authoring work earns proof via gate-as-proof (E).** When docs/ADR/library/story authoring is
   made buildable, its "proof" is the **structural gate that guards it staying green** (an ADR's
   proof = `check:adr-health`; a library edit's = zod-validation + reconcile; a story's =
   decision-binding/frontmatter check), which the inner loop can observe. This makes the owner's
   "ADR → story corpus" hypothesis literal. Designed in its own ADR when E is reached.

6. **Home + bootstrap.** The expansions are authored as new capabilities under the existing
   **`drive-machinery`** story ("*machinery is ordinary work in the ordinary tree*",
   [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) §3). The keystone (A) must itself be built **outer-loop
   first** — the loop cannot self-register until A exists. That bootstrap is the accepted paradox in
   [[inner-loop-for-everything]], not a violation of point 1.

## Consequences

**Good.**
- Authoring a node and making it buildable become one act; the bridge's structural break (G5) closes.
- B/C/D progressively widen the envelope so real iteration work (non-TS proofs, multi-file changes,
  whole stories) can move inside the loop — each landing a signed verdict + a wisp, reversing the
  "mostly-empty world" ([ADR-0048](0048-in-flight-build-is-the-primary-wisp.md)).
- `drive-machinery` moves toward `healthy`: once A lands, its own capabilities can be driven through
  the gate that proves them (the bootstrap rung its Honest status names).

**Bad / costs.**
- A is a schema + loader + resolver change with a migration of the existing 7 registry entries into
  spec-borne config; the registry stays as a validation/fallback layer (two sources during the
  transition — explicitly time-boxed to the migration).
- Trust boundary shift: proof config moving into the spec means a node author declares its own write
  scope. The honesty walls (spine observes red/green; test-author ≠ code-author) must hold regardless
  of where the config is declared — the scope is still spine-enforced, only its *source* moves.
- The PR/CI rail stays load-bearing for landing (point 4); "inner loop for everything" is **not**
  "no PR" until/unless the deferred approval-gated-trunk question is taken up.

## References

- [`docs/research/inner-loop-capability-envelope.md`](../research/inner-loop-capability-envelope.md) — the envelope map, the PR gap audit, the bridge analysis.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate (the honesty walls this ADR must preserve).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the live SDK leaf; the human owns the outer loop.
- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — REAL builds + promotion (the landing rail; machinery-is-ordinary-work).
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — decision binding (the ADR↔story link this bridge builds on).
- [ADR-0044](0044-per-uat-test-human-attestation.md) — the attestation surface (the alternative authoring-proof route E weighed against gate-as-proof).
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — wisps/verdicts come only from the inner loop.
- [ADR-0050](0050-adr-number-allocation.md) — how this ADR's number was allocated.
- [`stories/drive-machinery/story.md`](../../stories/drive-machinery/story.md) — the home story (Open modeling call #5 named the keystone).
- [test-command-registry.ts](../../packages/orchestrator/src/test-command-registry.ts) — the registry the keystone moves into the spec.
