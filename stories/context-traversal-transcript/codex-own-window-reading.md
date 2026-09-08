---
id: "codex-own-window-reading"
tier: capability
story: context-traversal-transcript
arc: codex-onboarding-journey-arc
title: "The current Codex task reads its raw context-window occupancy from its exact rollout"
outcome: "The current Codex task can read its raw context-window occupancy honestly from its exact rollout."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 248, 555]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/codex-context-window.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/codex-context-window.ts"]
  real:
    testFile: "packages/context-traversal-transcript/src/codex-context-window.test.ts"
    sourceFile: "packages/context-traversal-transcript/src/codex-context-window.ts"
    scope:
      testGlobs: ["packages/context-traversal-transcript/src/codex-context-window.test.ts"]
      sourceGlobs: ["packages/context-traversal-transcript/src/codex-context-window.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "typecheck"]
---

# The current Codex task reads its raw context-window occupancy from its exact rollout

**Outcome —** The current Codex task can read its raw context-window occupancy honestly from its
exact rollout.

The `arc: codex-onboarding-journey-arc` stamp preserves this capability's initiative provenance
while the transcript story remains the canonical owner of host-written context records. ADR-0555
makes Codex the subscription-backed default; it does not make the Claude transcript reader wrong.
This capability is additive: the existing Claude extraction, worktree correlation and ingest path
keep their contracts and behavior unchanged.

## Proof walkthrough first

Build a temporary Codex home with dated `sessions/YYYY/MM/DD` rollout files for the target thread, a
different thread, and a filename near-miss. Supply the target through `CODEX_THREAD_ID`. Observe that
only the rollout whose `session_meta` identity exactly matches is read. Give that rollout both
authoritative `token_usage_record` rows and legacy `event_msg` token-count rows around a compaction;
observe that the authoritative input values win, the latest value is resident, the maximum is peak,
cached input is not added again, and the runtime-declared model window is carried through. Repeat
with an old-format rollout holding only token-count events and observe the fallback. Finally remove,
one at a time, the thread identity, the matching rollout and every usable usage record; each case
must return its named absence. In every available case composition and scheduling band remain
explicitly unavailable rather than rendering as zero or calm.

All fixtures are local JSONL files under a temporary directory. No real Codex transcript, network,
database, model invocation or credential participates.

## Build boundary

Author only:

- `packages/context-traversal-transcript/src/codex-context-window.ts`
- `packages/context-traversal-transcript/src/codex-context-window.test.ts`

The source exports one deep, read-only operation accepting a Codex sessions root and an
environment-shaped identity input. Its result is discriminated: unavailable reads name exactly one
of `identity-unavailable`, `rollout-unavailable`, or `usage-unavailable`; available reads carry the
exact `threadId`, `usageSource` (`token_usage_record` or `event_msg.token_count`),
`residentInputTokens`, `peakInputTokens`, and availability-tagged `modelContextWindow`,
`composition`, and `schedulingBand` fields. Equivalent names are permitted, but callers must be
unable to mistake unavailable identity, usage, capacity, composition or scheduling judgment for a
numeric zero or a healthy state.

The CLI's `storytree context` selection and rendering are connective glue in the `cli` story. They
may call this package boundary and preserve its discriminants, but they are not a second parser and
are not claimed by this capability. Do not edit or replace `transcript-occupancy.ts`,
`correlate-transcripts.ts`, their tests, or the Claude selection path. Do not write a trace, compute
a continuation decision, or infer composition here.

## Reading rules

**Identity is direct, never correlated by cwd.** The current Codex task identity is the non-blank
`CODEX_THREAD_ID`. `CODEX_SESSION_ID` is not an alias: in delegated work it can name the parent task.
The current working directory is also not an identity — the parent and a delegated task can record
the same checkout. With no usable `CODEX_THREAD_ID`, return `identity-unavailable` and do not scan for
the newest rollout.

**The rollout match is exact.** Search only beneath the supplied current sessions root (the normal
shape is `~/.codex/sessions/YYYY/MM/DD/rollout-...-<thread-id>.jsonl`). A filename suffix can narrow
the candidates, but the accepted file's `session_meta` thread identity must equal
`CODEX_THREAD_ID`. A prefix, substring, neighbouring task, newest file, or cwd match never wins. No
exact match returns `rollout-unavailable`; ambiguity is refused rather than settled by recency.

**One usage vocabulary wins for the whole read.** A usable `token_usage_record` contributes its
`usage.input_tokens`. When at least one usable authoritative row exists, derive the series only from
usable authoritative rows. Fall back to `event_msg` rows whose payload is `token_count` only when
the rollout has no usable authoritative usage; the fallback value is
`last_token_usage.input_tokens`, never cumulative `total_token_usage`. Do not interleave both
vocabularies into one series — they can describe the same request.

**Cached input is already inside input.** Codex reports `cached_input_tokens` as a subset of
`input_tokens`. Never add it to `input_tokens`, in either vocabulary. Output tokens and cumulative
token totals do not participate in the resident series.

**Resident and peak describe a compactable series.** Preserve rollout order. The last usable input
value is `residentInputTokens`; the maximum usable value across the whole selected rollout is
`peakInputTokens`. A post-compaction reading is expected to fall, so neither running sum nor final
cumulative total can satisfy the contract.

**Capacity is declared, never inferred.** Carry the latest valid positive-integer
`model_context_window` declared by a token-count event. If the rollout has usable input usage but
declares no capacity, keep occupancy available and return capacity as explicitly unavailable. Never
substitute a model-name table or a Storytree scheduling threshold.

**The current answer is raw.** This rollout does not expose Storytree's phase/tool/prose composition,
and the owner has not yet settled how continuation marks should scale to Codex's smaller declared
window. Both fields are explicitly unavailable. The words `calm`, `soft` and `hard`, and zero-valued
stand-ins for either missing field, do not belong in this capability's result.

**Metadata only and fail-honest.** Parse usage and identity metadata only. No prompt, response,
reasoning, tool input/result, path, or arbitrary rollout object reaches the result. Malformed lines
are declined without throwing while later valid lines remain readable. A file from another thread
must never become the current task's answer merely because the exact file is malformed.

## Contracts

Each contract id is the lead token of its distinct test title in
`packages/context-traversal-transcript/src/codex-context-window.test.ts`.

1. **`codex-rollout-selection-uses-the-exact-thread-identity`** — the reader selects only the current
   task's exactly identified rollout.
   - **asserts —** with `CODEX_THREAD_ID: "thread-target"`, a dated root containing exact, prefix,
     suffix, newest-foreign and same-cwd fixtures returns only the exact file whose `session_meta`
     identity is `thread-target`; neither `CODEX_SESSION_ID` nor cwd affects the result.
   - **falsifiability —** goes red against newest-file fallback, prefix/substring matching, trusting
     a filename without confirming `session_meta`, parent-session attribution, cwd correlation, or
     combining observations from more than one rollout.
2. **`codex-token-usage-record-is-authoritative-with-legacy-fallback`** — authoritative input usage
   wins, while an old rollout still has one explicit fallback.
   - **asserts —** conflicting record vocabularies report `token_usage_record` and exactly the
     authoritative series; a separate rollout with no usable authoritative row reports
     `event_msg.token_count` and reads `last_token_usage.input_tokens`.
   - **falsifiability —** goes red against preferring event messages, mixing both vocabularies,
     reading cumulative `total_token_usage`, or refusing a valid old-format rollout.
3. **`codex-cached-input-is-a-subset-never-an-addend`** — cached input cannot inflate occupancy.
   - **asserts —** a record with `input_tokens: 120000` and `cached_input_tokens: 110000` contributes
     exactly `120000`, and a fallback record with the same relationship does likewise.
   - **falsifiability —** goes red against returning `230000`, cached input alone, output-inclusive
     input, or any value assembled by summing fields around `input_tokens`.
4. **`codex-resident-is-latest-and-peak-is-max-across-compactions`** — the summary preserves a
   compactable occupancy series.
   - **asserts —** ordered input observations `223965, 234228, 38871, 167204` yield resident
     `167204` and peak `234228`; the low third value is retained as a compaction.
   - **falsifiability —** goes red against resident=max, peak=latest, a cumulative sum, max-so-far as
     resident, sorting by value, or stopping at the first compaction.
5. **`codex-model-context-window-is-reported-only-when-declared`** — runtime capacity is carried
   independently from usage.
   - **asserts —** the latest valid `model_context_window: 258400` is returned as available; a
     rollout with valid usage and no declared capacity still returns occupancy, with capacity
     explicitly unavailable.
   - **falsifiability —** goes red against dropping the declared value, inventing one from a model
     name, treating missing capacity as zero, or making capacity absence erase valid usage.
6. **`codex-missing-identity-rollout-and-usage-have-distinct-absences`** — every unavailable reading
   says why it is unavailable.
   - **asserts —** blank/missing identity, no exact rollout, and an exact rollout with no usable
     usage return `identity-unavailable`, `rollout-unavailable`, and `usage-unavailable`
     respectively, without throwing; malformed JSON among otherwise valid lines remains partial.
   - **falsifiability —** goes red against one generic zero result, an exception, a foreign/newest
     fallback, or a malformed line suppressing later valid usage.
7. **`codex-composition-and-scheduling-band-remain-explicitly-unavailable`** — raw occupancy is not a
   fabricated continuation verdict.
   - **asserts —** every available reading carries unavailable composition and unavailable
     scheduling-band discriminants, and its serialized form contains neither a zero composition nor
     `calm`, `soft` or `hard`.
   - **falsifiability —** goes red against reusing Claude's absolute marks, calculating a percentage
     band without an owner-settled policy, returning empty composition as measured zero, omitting the
     discriminants, or letting a caller infer these fields from numeric defaults.

## Integration evidence

The test creates every rollout under a fresh temporary Codex sessions root and removes it after the
test. It exercises the public reader against JSONL bytes on disk. The exact-match fixture sorts
before and is older than a foreign fixture so recency and readdir order cannot accidentally satisfy
identity. The preference fixture carries conflicting authoritative and fallback values. A canary in
prompt, response, reasoning and tool fields is absent from the serialized result.

Run `pnpm --filter @storytree/context-traversal-transcript test` and then
`pnpm --filter @storytree/context-traversal-transcript typecheck`. The genuine red is the new test's
import of the absent source module; green is the read-only implementation satisfying all seven
contract ids. No live rollout or user credential is evidence for this unit.
