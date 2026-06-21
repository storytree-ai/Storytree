---
id: "spec-borne-proof-config"
tier: capability
story: drive-machinery
title: "Node-borne proof config (self-registering nodes)"
outcome: "An authored node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable."
status: mapped
proof_mode: integration-test
depends_on: [prove-spec-resolution]
---

# Node-borne proof config (self-registering nodes)

**Outcome —** An authored node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable.

**Depends on —** [`prove-spec-resolution`](prove-spec-resolution.md)

> **Proof status (honest) — `mapped`, built outer-loop (the bootstrap).** The change is BUILT and
> its dominant behaviour is observationally verified by a real, passing, OFFLINE suite
> (`packages/orchestrator/src/proof-config.test.ts` — the schema legs — plus the spec-borne
> resolution/parity/wall legs in `resolve-prove-spec.test.ts`; `@storytree/orchestrator` 119/119,
> ran 2026-06-14). Per the bootstrap caveat in
> [ADR-0057](../../docs/decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
> it had to be built **outer-loop first** (the loop cannot self-register until this exists) and is a
> MULTI-FILE change (proof-config.ts + node-spec.ts + resolve-prove-spec.ts + the 7 specs + the CLI),
> which the single-file inner loop cannot yet drive — so it is `mapped`, not `healthy`. The
> `proposed` pocket: re-running these proofs UNDER the gate (the bootstrap rung toward `healthy`) is
> open work, and awaits expansion C (multi-file builds). The honesty walls of
> [`prove-it-gate`](prove-it-gate.md) and [`phase-scoped-write-wall`](phase-scoped-write-wall.md) are
> PRESERVED unchanged — only the *source* of a node's write scope moves (spec, not registry);
> enforcement stays spine-side (contract 6 proves the wall predicate AND the enforcement path hold
> from a spec-sourced scope).

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

> **Owner call — RESOLVED (ADR-0087, 2026-06-21): bound an over-declared spec scope STRUCTURALLY.**
> Moving the declaration site into the spec means a node author writes its own `sourceGlobs`.
> Enforcement is unchanged (the phase predicate still walls every write; one build = one unitId = one
> spec; a leaf can never write a test in IMPLEMENT or author the verdict). The remaining question —
> whether a *new* spec-borne-only node (no registry twin to diff against) needs a STRUCTURAL bound on
> its self-declared scope, or whether PR-diff review is the accepted control — was the live OQ
> `oq-structural-bounds-on-spec-borne-proof-declarations`. The owner chose the **structural bound**
> (Option B): every write-scope glob must stay within one concrete `packages/<pkg>/` or `apps/<app>/`
> (no bare `**/*`, no wildcard package segment, no `..` escape, no absolute path), enforced as a
> fail-loud refine on `PathWriteScopeConfigSchema` (`scopeGlobBoundIssue`) so an over-broad scope can
> never resolve. See [ADR-0087](../../docs/decisions/0087-spec-borne-write-scope-is-bounded-structurally-not-by-pr-dif.md).
> The companion proof-command executable allow-list (the OQ's second sub-bound) is a named follow-on,
> decided-in-principle but not yet built.

## Integration test

**Goal —** An authored node with a spec-borne `proof:` block resolves into a runnable `ProveSpec`
and drives through the REAL gate offline, with NO entry in `NODE_BUILD_REGISTRY` — proving the
registry is no longer required to make a node buildable. Mirror `prove-spec-resolution`'s offline
walks (dry-run glue + the REAL-mode worktree walk via the `authorOverride` seam), keyed off a spec's
own proof config rather than the hand-map.

## Contracts (6)

1. **`spec-proof-block-parses`** — the loader reads + zod-validates an optional `proof:` block off a node spec
   - **asserts —** a well-formed block yields a typed build config; a malformed block is LOUD (`.strict()` rejects a typo'd key, an empty glob, an empty command, `install:true` without `typecheck`); absent = not buildable (fail-closed).
   - **covers —** `packages/orchestrator/src/proof-config.ts` (the schema + `parseNodeBuildConfig`), `packages/orchestrator/src/node-spec.ts` (the loader populates `spec.buildConfig`, loud with the file path)
   - **proven by —** `packages/orchestrator/src/proof-config.test.ts` (REAL, passing — the schema/malformed legs); `resolve-prove-spec.test.ts` (the loader leg, via `loadById`)
2. **`spec-config-feeds-resolution`** — `resolveProveSpec` fills every ProveSpec field from the spec-borne config
   - **asserts —** a spec-borne node with NO registry entry resolves (dry-run glue, `source: "spec"`); real-mode arms the leaf's feedback tools off the spec (run_proof + run_typecheck for install, run_proof only otherwise).
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` (`resolveBuildConfig` + `resolveProveSpec`)
   - **proven by —** `resolve-prove-spec.test.ts` (the three "contract 2 —" tests, REAL, passing)
3. **`registry-becomes-fallback`** — a spec without a `proof:` block falls back to a registry entry if one exists; spec-borne wins on conflict
   - **asserts —** a registry-only spec (no block) resolves via the registry (`source: "registry"`); a spec-borne block of the same id WINS over the registry twin.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` (`resolveBuildConfig`), `test-command-registry.ts` (demoted to fallback)
   - **proven by —** `resolve-prove-spec.test.ts` (the two "contract 3 —" tests, REAL, passing)
4. **`existing-entries-migrate-without-drift`** — the 7 current `real:` entries, mirrored into their specs, resolve identically
   - **asserts —** a parity check: each spec-borne config `deepEqual`s its live registry twin for verdict-line, declare-presence, presence-store, noticeboard-cli, tree-view, ambient-integration, verdict-glyphs; the migrated set == `realBuildableNodeIds()`.
   - **covers —** the 7 specs + the kept registry twins (the live parity oracle)
   - **proven by —** `resolve-prove-spec.test.ts` (the two "contract 4 —" tests, REAL, passing)
5. **`unregistered-still-fails-closed`** — a node with neither a spec block nor a registry entry refuses with guidance
   - **asserts —** the fail-closed posture holds; the refusal names BOTH routes out (declare a `proof:` block / register it) and lists the buildable ids.
   - **covers —** `resolve-prove-spec.ts` (the `resolveBuildConfig === null` branch), `packages/cli/src/node-build.ts` (the CLI envelope)
   - **proven by —** `resolve-prove-spec.test.ts` ("contract 5") + `packages/cli/src/node-build.test.ts` (REAL, passing)
6. **`scope-source-moves-walls-hold`** — a spec-declared scope is enforced spine-side exactly as a registry scope is
   - **asserts —** the `PathWriteScope` predicate matrix (test only in AUTHOR_TEST; source only in IMPLEMENT; observe-only phases deny all) AND the `WriteScopedToolExecutor` enforcement path (an out-of-phase write is refused, the inner executor never reached, the violation recorded) both hold when the scope is sourced from a spec's `proof:` block — identical to a registry scope.
   - **covers —** `phase-machine.ts` + `write-scoped-executor.ts` (UNCHANGED) driven from spec-borne scope
   - **proven by —** `resolve-prove-spec.test.ts` (the two "contract 6 —" tests, REAL, passing)
