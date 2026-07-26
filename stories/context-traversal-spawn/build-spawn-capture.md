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

**Fail-silent is not the same as unobserved — assert that the write SUCCEEDED.** The sink names one
file per session, `<sessionId>.jsonl`, and swallows every write failure (`catch { return false }`).
That posture is correct for production and treacherous for a proof: a lane that never persists looks
exactly like a lane that persisted, unless the proof reads the directory back. A measured instance:
a child session id containing `:` — legal in the vocabulary, illegal in a Windows path segment —
returned `false` and left zero files on disk, silently. The id's filename-safety is now
`leaf-slice-spawn-observations` contract 11 (that is where the id is composed, so that is where it
is fixed); the obligation HERE is that contract 1 observes the real files rather than a return value
or a call count.

**Metadata only, asserted on the BYTES (ADR-0235 clause 6, ADR-0241 D4).** The observer emits counts
only, and the sink validates every event against increment 1's vocabulary before writing, so the
metadata-only rule is a claim about what is on disk. Prove it that way: thread a canary through
every free-text-looking input and assert the canary against the file TEXT, not against parsed
objects.

**A `byModel` KEY is declared metadata, not a free-text input — and the current canary fixture uses
one, which is EXPECTED TO CHANGE.** Contract 6 here already requires the child lane's bytes to carry
"the matching `modelId`", and `leaf-slice-spawn-observations` contract 8 requires the sole `byModel`
key to be emitted as exactly that `modelId` (the vocabulary declares it `modelId: identity.optional()`).
A `byModel` key is therefore a runtime-declared, deliberately-emitted identity — and none of clause
6's banned categories: no prompt, no phase-prompt body, no tool result, no file content, no
credential, no spawn payload, no returned result content. The current test fixture nonetheless
threads its canary through a `byModel` KEY (`` [`model-${CANARY}`] ``, with no `contextWindow`); that
passes today ONLY because the observer does not yet emit `modelId` at all. The moment contract 8 is
implemented where it belongs, that canary reaches the bytes and contract 5 goes red. **The fixture is
what is wrong, not the contract — that assertion is not a fixed point.** Move the canary onto inputs
that are genuinely never emitted in any form (`subtype`, for example, from which only the derived
boolean `ok` ever travels out). Contract 5's STRENGTH is unchanged: the canary must still be threaded
through EVERY genuinely free-text input, so this narrows the carrier set by exactly one declared
field and weakens no claim.

**Declared capacity survives to the BYTES, or it is not proven.** Clause 6 is a claim about what is
on disk, and that applies to what IS carried as much as to what is not. This composition is a
transparent carrier — it routes events, it does not author them — so the window it writes is
whatever `leaf-slice-spawn-observations` emitted. That transparency is exactly why it needs asserting
HERE: a field that survives the observer's own suite can still be dropped, coerced, or defaulted
between the observer and the file, and an "absent" key that is really a serialized `null` or `0`
reads downstream as a declared capacity of zero — fabricated metadata by another route. Prove both
outcomes on the file text: a slice declaring one distinct positive window writes a child
`model_context` LINE carrying that number and its `modelId`; a slice declaring none writes the same
line with the key WHOLLY ABSENT. `build-capture.ts` may need no change at all for these to pass, in
which case the unit is test-only and its red comes from the missing assertions — that is a
legitimate red; do not manufacture a source change to justify one.

**Fences.** No retention, rotation, eviction, compaction, pruning, or size cap. No shared-database
or hosted path. No reading of prompts, phase-prompt bodies, tool results, file contents,
credentials, spawn payloads, or returned result content — this composition never sees them and must
never be given a parameter that could carry them.

Files: `packages/context-traversal-spawn/src/build-capture.ts` and `build-capture.test.ts`. Append
the barrel export line only after the source lands.

## Contracts

1. **`parent-and-child-lanes-land-in-their-own-files`**
   - **asserts —** after one capture over slices with usage, the trace directory CONTAINS both files
     — `<dir>/<parentSessionId>.jsonl` holding the `spawn_handoff` and `result_return` events, and
     each `<dir>/<childSessionId>.jsonl` holding that child's `model_context` — asserted by listing
     the directory and reading the file CONTENTS back through a fresh reader, never on a return
     value or a call count, and with no child event in the parent's file or vice versa. A write the
     sink silently refused must FAIL this contract, not pass it.
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
   - **a `byModel` KEY is not a valid canary carrier.** It is declared metadata that contract 6 here
     and `leaf-slice-spawn-observations` contract 8 both REQUIRE to be emitted, as `modelId` — so
     threading the canary through one sets this contract against its own siblings. The current
     fixture does exactly that and is EXPECTED TO CHANGE; the canary belongs on inputs never emitted
     in any form. The asserted claim above is unchanged and undiminished — every genuinely free-text
     input still carries it.
6. **`a-declared-window-reaches-the-child-lane-bytes`**
   - **asserts —** capture a build whose slice run accounting declares exactly ONE distinct positive
     context window, then READ `<dir>/<childSessionId>.jsonl` back from disk through a fresh reader
     and inspect that child's `model_context` LINE: it carries `contextWindowCapacity` strictly equal
     to the declared number, and the matching `modelId`. The subject is the bytes the composition
     wrote — never a return value, a call count, or an in-process object.
   - **falsifiability —** the fixture's declared window is a distinctive number that no plausible
     default and no model-id → capacity map would produce, so a carrier that supplies capacity from
     anywhere other than the input FAILS rather than coincides. A contract satisfied by the test and
     the implementation agreeing on a key name proves nothing; this one is satisfied only by a
     specific number surviving a round trip through the filesystem.
7. **`an-undeclared-window-leaves-the-key-wholly-absent-in-the-bytes`**
   - **asserts —** capture a build whose slice declares NO context window, then read the same child
     trace back: the `model_context` line is present with its token observations intact, and
     `contextWindowCapacity` is WHOLLY ABSENT from the parsed line — not `null`, not `0`, not an
     empty string — with the raw file TEXT carrying no `contextWindowCapacity` key for that line at
     all.
   - **this is the load-bearing half.** An "absence" serialized as `null` or `0` is read downstream
     as a declared capacity, which is exactly the fabricated metadata ADR-0235 clause 6 forbids and
     is invisible to any assertion made on an in-process object. A carrier that writes the key with
     an empty value must go RED here.
8. **`written-bytes-carry-no-field-outside-the-closed-vocabulary`**
   - **asserts —** under BOTH outcomes above, every line of every written trace file parses through
     increment 1's `ContextTraversalEvent` union and carries no key outside that strict vocabulary,
     and no prose, label, message, or free text appears anywhere in the bytes — extending contract
     5 from "the canary is absent" to "nothing beyond the declared vocabulary is present", so a new
     field cannot arrive on disk unnoticed just because it is not the canary.

## Integration evidence

`packages/context-traversal-spawn/src/build-capture.test.ts` runs every case against a temporary
directory with an explicit parent session id, never the real `HOME` and never
`STORYTREE_TRAVERSAL_DIR` from the ambient environment. Durability is proven across instances: each
assertion reads the traces back through a fresh `readTraversalSession` reader rather than inspecting
in-process state. The no-op, never-throw, and canary contracts are asserted on the filesystem's
actual state — files absent, or file text scanned — so "capture is additive and metadata-only" is an
observation about disk rather than a claim about an object.

The capacity contracts run the SAME build twice over two temporary directories — once with a
declaring slice, once with an undeclaring one — and compare the two written child lines against each
other as well as against the input. That pairing is what makes the pass-through falsifiable: a
carrier that defaults, coerces, or drops the field produces two lines that agree where they must
differ, or differ where they must agree, and neither outcome can be reached by a value the test
composed for itself. The absence half is asserted on the raw file TEXT, not only on the parsed
object, because `null` and `0` both parse away into a falsy check while remaining plainly present in
the bytes.
