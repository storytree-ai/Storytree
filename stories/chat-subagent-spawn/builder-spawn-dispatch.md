---
id: "builder-spawn-dispatch"
tier: capability
story: chat-subagent-spawn
title: "The builder-leaf spawn dispatch — route the decided unit through the existing routed build worker"
outcome: "Given the unit the orchestrator decided to drive, a spawn-side dispatch validates it buildable and routes it through the EXISTING routed build worker, returning a typed runId and folding coarse progress back as conversation text — a build intent, never a verdict path."
# RETIRED with the chat-subagent-spawn story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat's
# agent-side spawn authority is moot (the embedded terminal running real Claude Code is the interactive
# seat; spawn/landing do not go to app-guide). Retired in place; body kept as history. The `real:` arm is
# dropped, so this capability is no longer REAL-buildable (buildableNodeIds keys on proof.real) —
# packages/cli/src/node-build.test.ts's REAL-buildable snapshot is updated in this pass.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [137, 108, 91, 99, 90, 136]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors an
# integration test importing a NOT-YET-EXISTING dispatch from a NEW module in packages/drive (red =
# module-not-found at HEAD), then writes that one new source file (green). The module is
# INJECTION-PURE: it takes a BuildContext-shaped deps object (the routed runner, the registry, the
# isBuildable precheck — structural types, matching the relocated worker's shapes) so the proof runs
# over scripted doubles with zero live builds and zero DB (ADR-0010 §5). The RED is a runtime
# module-not-found; the refusal/progress behaviours are runtime-observable (never a type-only red).
# NO install / NO typecheck arm needed: deps are injected and any worker-type imports are type-only
# (erased) or structurally duplicated — the take-claim-at-spawn precedent for a pure-seam proof. Scope
# stays within packages/drive (ADR-0087). Single LITERAL source file — default node:test proof, no
# proofCommand.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
# The `real:` arm was dropped on retirement (explorer-onboarding-arc inc1 / ADR-0175 companion) — see the
# RETIRED note above. proof.command + proof.scope are kept as history.
---

# The builder-leaf spawn dispatch — route the decided unit through the existing routed build worker

**Outcome —** Given the unit the orchestrator decided to drive, a spawn-side dispatch validates it
buildable and routes it through the EXISTING routed build worker, returning a typed runId and folding
coarse progress back as conversation text — a build intent, never a verdict path.

**Depends on —** nothing in-story (a root). Cross-story it consumes the relocated build worker
verbatim (`routedBuildRunner` / `BuildRegistry` / `runBuildJob` + the `BuildContext` shape,
`@storytree/drive/build-worker` — owned by `desktop-build-mount`, relocated per ADR-0133 d.3) and the
`@storytree/orchestrator` discovery precheck the worker's `isBuildable` already composes.

> **Proof status (honest) — `proposed`.** This is ADR-0137 d.1's second arm: "bug fix / change →
> spawn the inner-loop builder leaf; the spine observes RED→GREEN and SIGNS, CI re-proves, the human
> lands." The "spawn" here is a DISPATCH into the already-built gate machinery — the leaf, the phase
> machine, and the signing spine all live inside the worker's build entries; this capability adds the
> agent-side caller, never a second build path.

## Guidance

A THIRD CALLER OF ONE WORKER, NEVER A NEW BUILD PATH (ADR-0090 / the desktop-build-mount precedent):
the studio `/api/build` route and the desktop accept click already drive `routedBuildRunner` through
the same `BuildContext`. This dispatch is the AGENT-side third caller — the orchestrator's spawn tool,
not the human's click. Get this wrong — invoking build entries directly, re-implementing tier routing,
or forking the registry — and you stand up a second build path outside the worker's guards.

CONSUME THE TIER ROUTING VERBATIM — THE FIX-DRIVE `--real` SHAPE IS THE WORKER'S (the story-level
sequencing note / OQ-A, `oq-fix-drive-build-shape` — RESOLVED by ADR-0144 before this capability was
built): the worker routes a node id to `node build --real` with persist semantics (the node's real
proof, signed verdict to `events.verdict`, PASS parked on a `claude/real/*` branch) and a story id to
`story build --real`; the synthetic `--live` smoke (ADR-0099-B) is a CLI-only pipeline check, no
longer what a dispatch drives. This dispatch must NOT special-case, override, or duplicate the
routing: it inherited the `--real` node drive from the worker with zero change here — the routing was
built once, inside the worker.

THE DISPATCH IS A SAFE BUILD INTENT (ADR-0091 / ADR-0108 d.5): a unit id to the worker, a `{ runId }`
back. The spine INSIDE the worker observes real RED→GREEN exit codes and signs; this module holds no
signing key, parses no verdict, and exposes no verdict-shaped type — the progress it folds back is the
worker's coarse TEXT lines, for the conversation. Landing is not here either (ADR-0108 d.3 /
ADR-0136): the worker's own PR path + the human ceremony own the trunk.

REFUSE GARBAGE FAIL-CLOSED: an unknown id, a malformed spec, or an unbuildable unit (no proof config /
not story-buildable — the worker's own `isBuildable` precheck) is a TYPED refusal, never a dispatch
and never a throw. The orchestrator surfaces the refusal in conversation and re-judges (decision 4's
consultative loop) — the honest failure is the feature.

INJECTION-PURE FOR THE PROOF: the worker deps arrive as an injected `BuildContext`-shaped argument
(exactly how the mounts are proven — `build-route.test.ts` / `accept-dispatch.test.ts` over an
injected context), so the offline proof scripts the runner and never spawns a billed build
(ADR-0010 §5). The REAL context is composed by [`spawn-deps-composition`](spawn-deps-composition.md) /
the desktop sidecar.

## Integration test

**Goal —** Prove that a decided unit id is validated then dispatched to the real registry through an
injected scripted runner, returning a typed runId with coarse progress folded back as text, and that
unknown/unbuildable ids are refused typed — offline, no live build, no DB.

Exercised against its **real in-story collaborators** — the real dispatch over the real registry
shape; the routed runner is the injected scripted double (the same seam the worker's own proofs use).

The integration test would:

1. Dispatch a buildable unit id → assert `isBuildable` was consulted, the injected routed runner
   received the SAME id (routing untouched), and a typed `{ runId }` came back.
2. Feed scripted coarse progress lines through the run → assert they fold back as ordered
   conversation text.
3. Dispatch an unknown id and an unbuildable id → assert a typed refusal each time, the runner never
   invoked.
4. Assert the module's surface exposes no verdict-shaped type and no landing verb (structural — the
   ADR-0091 wall).

## Contracts (3)

1. **`bsd-dispatches-through-the-existing-routed-worker`** — the decided unit reaches the SAME worker
   the human's accept click uses
   - **asserts —** a buildable unit id is validated via the injected `isBuildable` precheck then
     handed to the injected routed runner/registry UNMODIFIED (no tier re-routing, no flag
     special-casing — the sibling `--real` routing increment is inherited, never duplicated),
     returning a typed `{ runId }`.
   - **covers —** `packages/drive/src/spawn-builder.ts`
   - **proven by —** `packages/drive/src/spawn-builder.test.ts` (net-new, offline, injected context).
2. **`bsd-refuses-unbuildable-or-unknown`** — garbage is a typed refusal, never a dispatch
   - **asserts —** an unknown id, a malformed spec, or a unit failing the `isBuildable` precheck
     returns a typed refusal (the reason named for the conversation); the routed runner is NEVER
     invoked; nothing throws.
   - **covers —** `packages/drive/src/spawn-builder.ts` (the validation arm)
   - **proven by —** `packages/drive/src/spawn-builder.test.ts`.
3. **`bsd-progress-is-text-never-a-verdict`** — what crosses back to the conversation is status text,
   never a verdict
   - **asserts —** the worker's coarse progress lines fold back as ordered TEXT for the chat surface;
     the dispatch's result/progress types carry NO verdict/signing/proof-status shape (the spine
     inside the worker signs out-of-band, ADR-0091 — there is structurally nothing for the chat to
     hand in or relay as a verdict).
   - **covers —** `packages/drive/src/spawn-builder.ts` (the progress fold + the result types)
   - **proven by —** `packages/drive/src/spawn-builder.test.ts`.
