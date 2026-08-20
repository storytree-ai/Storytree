---
id: "build-usage-accounting"
tier: capability
story: drive-machinery
title: "Per-slice token accounting on the build's own event stream — accounting, never proof"
outcome: "A build's per-slice token accounting lands on its own event stream as a kind no verdict reads."
status: proposed
proof_mode: integration-test
depends_on: [work-verdict-event-log]
# A greenfield capability registered after its implementation and tests (capability-layer-coverage-arc,
# 2026-08-07). Per ADR-0395, retrospective registration does not make it brownfield or Adopt-bound.
# Spec-borne `proof:` (ADR-0057) with NO `real:` arm; the proving file is drive-resident, so the package
# suite is the whole command.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
---

# Per-slice token accounting on the build's own event stream — accounting, never proof

**Outcome —** A build's per-slice token accounting lands on its own event stream as a kind no verdict
reads.

*(The ADVISORY posture — a failed accounting write warns and never fails a build that already proved
its unit — was demoted out of the outcome to avoid a banned conjunction; it lives where it is proven,
in contract 5 `the-accounting-append-is-advisory`.)*

**Depends on —** [`work-verdict-event-log`](work-verdict-event-log.md). Real edge, real direction:
`usage.ts:2` imports `usageEvent` from `@storytree/orchestrator` — the event-log capability owns the
`usage` event kind, its `runId:unitId:phase` key, its fail-closed validation, and the SQL routing to
`events.usage_event`. This capability cannot append a single honest row without it.

> **Proof status (honest) — `proposed` (real passing offline tests, but no current signed pass).** The
> whole mapping and the whole append are covered by 5 REAL, passing, offline tests in
> `packages/drive/src/usage.test.ts`, part of the `@storytree/drive` suite, which I ran on 2026-08-07 —
> **484 tests, 484 pass, 0 fail, 0 skipped**. No DB, no SDK, no credential: the append runs against a
> real `InMemoryStore`. The implementation is greenfield Storytree work; its standing tests do not
> change provenance or supply the missing signed pass (ADR-0395).
>
> **What this capability does NOT claim, and where each half really lives.** The CAPTURE half (an SDK /
> Codex result → a `TokenUsage` breakdown) is `@storytree/agent`'s. The `usageEvent` CONSTRUCTOR and the
> `events.usage_event` SQL routing are [`work-verdict-event-log`](work-verdict-event-log.md)'s, proven
> at `packages/orchestrator/src/proof/usage-event.test.ts` and
> `packages/orchestrator/src/store/pg-work-store.test.ts:131`. And the claim that makes the outcome's
> "no verdict reads" true — `rollupStatus` ignoring the `usage` kind — is that same capability's
> projection, not this one's. What is proven HERE is the mapping and the append.
>
> **The `proposed` pocket.** The call sites that wire this into a real build
> (`node-build.ts:639` and `:899`) have no offline assertion; the `--store pg` write on a live `--real`
> run is exercised out-of-band, never on a gate pass (ADR-0010 §5).
>
> **No reliability gate `(covers:)` this capability yet.** Gate-3 runs the proving suite, but its
> `(covers:)` list was frozen before this node existed, so no current signed verdict names it — a
> stated proof gap, not a reason to route this greenfield capability through Adopt.

## Guidance

ADR-0203: the leaf reports what each authoring slice actually cost, and that number has to survive the
run. `packages/drive/src/usage.ts` is the persistence half — 81 lines, two functions:

- **`sliceUsageDocs(ids, runs)`** (`usage.ts:33-57`) is PURE: it maps each leaf slice's run accounting
  (`SdkRunInfo` from the Claude leaf, `CodexRunInfo` from the Codex one — the `LiveRunInfo` union at
  `:31`) into a `UsageEventDoc`. Every optional field is spread conditionally, so a runtime that does
  not report a figure does not acquire one.
- **`appendSliceUsage(store, ids, runs, signer, warn)`** (`:64-81`) appends those docs to the BUILD's
  event store: `events.usage_event` under `--store pg` on a real build, the in-memory store otherwise,
  where a dry-run's accounting honestly dies with the run exactly as its verdict does.

**ACCOUNTING, NEVER PROOF — three separate mechanisms, and all three matter.** Usage rides its OWN
event kind rather than the verdict (the signed verdict deliberately carries no runtime cost);
`rollupStatus` ignores that kind, so no amount of spend can move a unit's status; and the append is
ADVISORY (`:73-78`) — a store or validation failure is reported through `warn` and swallowed, so
accounting can never fail a build that already proved, or honestly failed, its unit. This is the same
posture [`phase-activity-write`](phase-activity-write.md) holds for the phase mark, and the reason
both are drive-side rather than gate-side.

**Capture is ADDITIVE — a slice with nothing honest to say is skipped, not invented** (`:35`). This is
the discipline behind two of the contracts below. A slice that reported no token breakdown produces no
row at all rather than a zero-filled one. And a Codex slice keeps SUBSCRIPTION accounting: `costUsd`
is spread only when the run actually carries it (`:44`), so a ChatGPT-funded run never acquires a
fabricated API list-price figure — the `--budget` refusal on that runtime (ADR-0232) would be
meaningless if the accounting quietly invented the number it refuses to cap.

**The fixture in the test is load-bearing, not decoration.** `ModelTokenUsage` is `.strict()`, so a
per-model field the leaf emits but the wire shape has not admitted makes the WHOLE doc fail to parse —
and because capture is fail-silent, that failure is INVISIBLE: verdicts stay green while
`events.usage_event` quietly stops recording. `usage.test.ts:31` carries `contextWindow` in the
`byModel` fixture for exactly that reason.

**Consumed by** [`build-drive-cli`](build-drive-cli.md): `node-build.ts:69` imports it and calls it
after the live/real walk at `:639` and `:899`.

## Integration test

**Goal —** Run the real mapping and the real append end-to-end over a real store and prove the row that
lands is a row the wire shape accepts: `SdkRunInfo` slices in → `sliceUsageDocs` → the real `usageEvent`
constructor → an `InMemoryStore` → read the events back and re-parse each doc through `UsageEventDoc`.
A doc that maps cleanly but cannot survive its own schema is exactly the silent accounting hole this
pipeline is most exposed to.

Real collaborators, no stubs: `packages/drive/src/usage.test.ts:92` (passing) appends two slices through
the real `usageEvent` (`@storytree/orchestrator`) into a real `InMemoryStore`, then asserts one `usage`
event per slice, the `runId:unitId:phase` ids (`real-x:u1:AUTHOR_TEST`, `real-x:u1:IMPLEMENT`), the
signer as actor, and — the load-bearing part — that the stored doc still parses as a `UsageEventDoc`
with its token axes intact. `:35` runs the same wire-shape parse over every mapped doc including the
per-model split.

Underneath, 5 tests in `usage.test.ts` (all passing) cover the mapping, both skip disciplines and the
advisory failure path. `proposed`: the greenfield capability has standing observational evidence but
no current signed pass (ADR-0395).

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`each-slice-with-a-breakdown-becomes-a-valid-usage-doc`** — the mapping is faithful and survives the wire shape
   - **asserts —** two SDK slices map to two docs, EVERY one of which parses as a `UsageEventDoc`; the first doc carries exactly the unit/run identity, its phase, `source: "sdk-leaf"`, the token breakdown, turns, `costUsd` and the configured model; the second's `byModel` per-model split is carried through verbatim, `contextWindow` included.
   - **covers —** `packages/drive/src/usage.ts:33-57`
   - **proven by —** `packages/drive/src/usage.test.ts:35` (REAL, passing)
2. **`a-slice-without-a-breakdown-is-skipped`** — capture is additive; nothing is invented
   - **asserts —** given one slice with no `usage` field and one with a breakdown, exactly ONE doc is produced and it is the slice that actually reported — no zero-filled row stands in for the silent one.
   - **covers —** `packages/drive/src/usage.ts:35`
   - **proven by —** `packages/drive/src/usage.test.ts:54` (REAL, passing)
3. **`codex-usage-keeps-subscription-accounting`** — a ChatGPT-funded run never acquires an API list price
   - **asserts —** a `CodexRunInfo` slice maps to a doc carrying `source: "codex-leaf"`, its own model, its usage and its `reasoningOutputTokens` — and `costUsd` is ABSENT from the doc entirely (not zero), while the doc still parses as a `UsageEventDoc`.
   - **covers —** `packages/drive/src/usage.ts:41-52`
   - **proven by —** `packages/drive/src/usage.test.ts:63` (REAL, passing)
4. **`one-usage-event-per-slice-on-the-builds-store`** — the append lands, keyed and attributed
   - **asserts —** appending two slices returns `2` and leaves two `usage` events on the store, keyed `runId:unitId:phase`, actored by the supplied signer, with the stored doc's token axes readable back through `UsageEventDoc.parse`.
   - **covers —** `packages/drive/src/usage.ts:64-81`
   - **proven by —** `packages/drive/src/usage.test.ts:92` (REAL, passing)
5. **`the-accounting-append-is-advisory`** — a failed accounting write can never fail a proven build
   - **asserts —** with a store whose `appendEvent` rejects, `appendSliceUsage` does NOT throw: it returns `0` appended and emits one warning per slice naming the doc and the underlying failure (`did not persist: store down`).
   - **covers —** `packages/drive/src/usage.ts:72-79`
   - **proven by —** `packages/drive/src/usage.test.ts:104` (REAL, passing)
