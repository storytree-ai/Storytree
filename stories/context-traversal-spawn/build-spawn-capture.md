---
id: "build-spawn-capture"
tier: capability
story: context-traversal-spawn
arc: linked-session-context-arc
title: "A build's parent and child lanes land as bytes in their own per-session traces"
outcome: "A build run appends its parent-lane spawn events and each child's own window observation to the right per-session trace, additively and fail-silently."
status: proposed
proof_mode: integration-test
depends_on: [leaf-slice-spawn-observations]
decisions: [235, 241, 192]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-spawn", "test"]
  scope:
    testGlobs: ["packages/context-traversal-spawn/src/build-capture.test.ts"]
    sourceGlobs: ["packages/context-traversal-spawn/src/build-capture.ts"]
  real:
    testFile: "packages/context-traversal-spawn/src/build-capture.test.ts"
    sourceFile: "packages/context-traversal-spawn/src/build-capture.ts"
    scope:
      testGlobs: ["packages/context-traversal-spawn/src/build-capture.test.ts"]
      sourceGlobs: ["packages/context-traversal-spawn/src/build-capture.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-spawn", "typecheck"]
---

# A build's parent and child lanes land as bytes in their own per-session traces

## Guidance

Author the capture COMPOSITION: the one entry point the build composition site calls. It observes
through `leaf-slice-spawn-observations`, then routes each event to the trace of the session it
belongs to, through increment 2's public barrel.

**Shape.**
`captureBuildSpawn({ parentSessionId, runId, unitId, runs, dir?, enabled?, now?, nextId? }): void`.
Parent-lane events (`spawn_handoff`, `result_return`) append to the parent's file; each child's
`model_context` appends to THAT child's own file — one `appendTraversalEvents` call per session id,
never one merged batch. The directory defaults to increment 2's `resolveTraversalDir()`; an explicit
`dir` wins so every proof runs against a temporary directory and never the real `HOME`.

**Consume increment 2, never edit it.** `appendTraversalEvents` and `resolveTraversalDir` come from
the `@storytree/context-traversal-capture` barrel — that is the public seam and importing it is both
fine and required. Nothing under `packages/context-traversal-capture/**` is modified by this story;
that package is held under another session's work claim, and its barrel already exports every symbol
needed here.

**Identity in, never derived (ADR-0241 D9).** `parentSessionId` is supplied by the caller. This
package must NOT import `@storytree/drive` for `deriveIdentity()` — that would make
`drive → spawn → drive` a cycle. The resolution PRECEDENCE at the caller matters and belongs in a
comment at the caller's resolution site: the CLI resolves `STORYTREE_SESSION_ID` first, then
`deriveIdentity()?.sessionId`, and the build glue must match it or a session's build lane lands in a
different file from its CLI reads, silently breaking the one-session-one-trace property increment 2
proved.

**Additive and fail-silent (ADR-0241 D3), never fail-closed.** A null, empty, or unresolvable
`parentSessionId` is a total no-op: no directory resolved, no file created, no error. `enabled:
false` and `STORYTREE_TRAVERSAL=off` are the same total no-op. Nothing here throws — the sink
already absorbs every filesystem edge, and this composition adds no await, no network, and no DB
call. Capture must never change an exit code, an envelope, a verdict, or a build's control flow: it
runs beside `appendSliceUsage`, which holds exactly this advisory posture.

**Metadata only, asserted on the BYTES (ADR-0235 clause 6, ADR-0241 D4).** The observer emits counts
only, and the sink validates every event against increment 1's vocabulary before writing, so the
metadata-only rule is a claim about what is on disk. Prove it that way: thread a canary through
every free-text-looking input and assert the canary against the file TEXT, not against parsed
objects.

**Fences.** No retention, rotation, eviction, compaction, pruning, or size cap. No shared-database
or hosted path. No reading of prompts, phase-prompt bodies, tool results, file contents,
credentials, spawn payloads, or returned result content — this composition never sees them and must
never be given a parameter that could carry them.

Files: `packages/context-traversal-spawn/src/build-capture.ts` and `build-capture.test.ts`. Append
the barrel export line only after the source lands.

## Contracts

1. **`parent-and-child-lanes-land-in-their-own-files`**
   - **asserts —** after one capture over slices with usage, `<dir>/<parentSessionId>.jsonl` holds
     the `spawn_handoff` and `result_return` events and each `<dir>/<childSessionId>.jsonl` holds
     that child's `model_context` — asserted on the file CONTENTS and read back through a fresh
     reader, never on a return value, and with no child event in the parent's file or vice versa.
2. **`an-absent-parent-session-is-a-total-no-op`**
   - **asserts —** a null or empty `parentSessionId` writes nothing, creates no directory and no
     file, and returns normally — an unresolvable identity is a silent no-op, never an error.
3. **`traversal-off-is-a-total-no-op`**
   - **asserts —** `STORYTREE_TRAVERSAL=off`, and an explicit `enabled: false`, each produce no
     directory and no file even with a valid parent session and slices that would otherwise emit.
4. **`capture-never-throws-and-never-changes-an-exit-code`**
   - **asserts —** capture against an unwritable target returns normally rather than throwing, and
     a caller's surrounding control flow, return value, and exit path are unchanged whether capture
     succeeds, no-ops, or fails — the advisory posture `appendSliceUsage` already holds.
5. **`no-canary-text-ever-reaches-the-bytes`**
   - **asserts —** a distinctive canary string threaded through every free-text-looking input
     appears nowhere in the written bytes of any trace file — no prompt, no phase-prompt body, no
     tool result, no file content, no credential, no spawn payload, no returned result content —
     asserted against the raw file text.

## Integration evidence

`packages/context-traversal-spawn/src/build-capture.test.ts` runs every case against a temporary
directory with an explicit parent session id, never the real `HOME` and never
`STORYTREE_TRAVERSAL_DIR` from the ambient environment. Durability is proven across instances: each
assertion reads the traces back through a fresh `readTraversalSession` reader rather than inspecting
in-process state. The no-op, never-throw, and canary contracts are asserted on the filesystem's
actual state — files absent, or file text scanned — so "capture is additive and metadata-only" is an
observation about disk rather than a claim about an object.
