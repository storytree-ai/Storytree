---
id: "spec-borne-proof-config"
tier: capability
story: drive-machinery
title: "Node-borne proof config (self-registering nodes)"
outcome: "An authored node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable."
status: proposed
proof_mode: integration-test
depends_on: [prove-spec-resolution]
---

# Node-borne proof config (self-registering nodes)

**Outcome —** An authored node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable.

**Depends on —** [`prove-spec-resolution`](prove-spec-resolution.md)

> **Proof status (honest) — `proposed`, UNBUILT.** This is the keystone expansion decided in
> [ADR-0057](../../docs/decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md):
> the code does not exist yet, and per the bootstrap caveat it must be built **outer-loop first** (the
> loop cannot self-register until this capability exists). The contracts below are the PROPOSED proof
> obligations, not a standing suite. They become `mapped`/`healthy` only once the change lands and is
> driven through the gate. The honesty walls of [`prove-it-gate`](prove-it-gate.md) and
> [`phase-scoped-write-wall`](phase-scoped-write-wall.md) are PRESERVED unchanged — only the *source*
> of a node's write scope moves (spec, not registry); enforcement stays spine-side.

## Guidance

The structural break this closes (findings:
[`docs/research/inner-loop-capability-envelope.md`](../../docs/research/inner-loop-capability-envelope.md),
gap G5): today "how to prove a node" lives in `NODE_BUILD_REGISTRY`
([`test-command-registry.ts`](../../packages/orchestrator/src/test-command-registry.ts)) — orchestrator
*code*, separate from the node's own `stories/<story>/<unit>.md` spec — so a node becomes buildable
only via a hand-edited orchestrator PR. That is the one manual joint in the
decision→story-author→registered-node→leaf-build→signed-verdict bridge the owner wants mechanical.

The change, three touch-points (the same files
[`prove-spec-resolution`](prove-spec-resolution.md) owns):

- **`node-spec.ts`** — extend the LIGHT frontmatter loader to read an optional, zod-validated
  `proof:` block off the spec: the proof command, the per-phase write-scope globs, and the `real`
  arm (`testFile`/`sourceFile`/`scope`/`install`/`typecheck`) — the same shape as
  `NodeBuildConfig`/`RealProofConfig` today, just declared *in the spec*. Fail-loud on a malformed
  block (the node-spec loader's existing posture).
- **`test-command-registry.ts`** — demote from source-of-truth to a **validation/fallback** layer:
  the 7 existing entries migrate into their specs; a residual registry (or a parity check) guards
  that no spec under-declares its scope, during the time-boxed transition. `lookupNodeBuildConfig`
  resolves spec-borne config first, registry second.
- **`resolve-prove-spec.ts`** — read the build config from the loaded `NodeSpec` instead of the
  registry lookup; everything downstream (`ShellTestExecutor`, `PathWriteScope`, prompts, feedback
  arming) is unchanged because it already takes a `NodeBuildConfig`-shaped value.

Resolves the story's **Open modeling call #5** (registering the machinery's own nodes): once a node
declares its own proof config, the 12 `drive-machinery` capabilities become buildable by authoring,
not by an orchestrator edit — the bootstrap rung toward `healthy`.

Trust note: a node author declaring its own write scope does NOT widen what a leaf may write — the
scope is still enforced spine-side by `phase-scoped-write-wall` and the SDK `PreToolUse` hook; only
the *declaration site* moves. The fail-closed default (a node with no `proof:` block is not
buildable) is preserved — silence is never a green light.

## Integration test

**Goal —** An authored node with a spec-borne `proof:` block resolves into a runnable `ProveSpec`
and drives through the REAL gate offline, with NO entry in `NODE_BUILD_REGISTRY` — proving the
registry is no longer required to make a node buildable. Mirror `prove-spec-resolution`'s offline
walks (dry-run glue + the REAL-mode worktree walk via the `authorOverride` seam), keyed off a spec's
own proof config rather than the hand-map.

## Contracts (6, PROPOSED)

1. **`spec-proof-block-parses`** — the loader reads + zod-validates an optional `proof:` block off a node spec
   - **asserts —** a well-formed block yields a typed build config; a malformed block is LOUD; absent = not buildable (fail-closed).
   - **covers —** `packages/orchestrator/src/node-spec.ts` (proposed)
   - **proven by —** (proposed; unbuilt)
2. **`spec-config-feeds-resolution`** — `resolveProveSpec` fills every ProveSpec field from the spec-borne config
   - **asserts —** command, scope, prompts, feedback arming match the spec, with no registry lookup.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` (proposed)
   - **proven by —** (proposed; unbuilt)
3. **`registry-becomes-fallback`** — a spec without a `proof:` block falls back to a registry entry if one exists; spec-borne wins on conflict
   - **asserts —** the migration is non-breaking; the residual registry still resolves un-migrated nodes.
   - **covers —** `packages/orchestrator/src/test-command-registry.ts` (proposed)
   - **proven by —** (proposed; unbuilt)
4. **`existing-entries-migrate-without-drift`** — the 7 current `real:` entries, moved into their specs, resolve identically
   - **asserts —** a parity check: spec-borne config == the old registry config for verdict-line, declare-presence, presence-store, noticeboard-cli, tree-view, ambient-integration, verdict-glyphs.
   - **covers —** the 7 specs + the parity guard (proposed)
   - **proven by —** (proposed; unbuilt)
5. **`unregistered-still-fails-closed`** — a node with neither a spec block nor a registry entry refuses with guidance
   - **asserts —** the fail-closed posture and the buildable-ids guidance are unchanged.
   - **covers —** `resolve-prove-spec.ts` (proposed)
   - **proven by —** (proposed; unbuilt)
6. **`scope-source-moves-walls-hold`** — a spec-declared scope is enforced spine-side exactly as a registry scope is
   - **asserts —** an out-of-phase write is still refused by the phase wall / PreToolUse hook regardless of where the scope was declared (the honesty property is preserved).
   - **covers —** `phase-machine.ts` + `write-scoped-executor.ts` (unchanged) driven from spec-borne scope
   - **proven by —** (proposed; unbuilt)
