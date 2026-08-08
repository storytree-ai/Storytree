---
id: "library-health-gate"
tier: capability
story: library
title: "Classify library health and separate gate failures from warnings"
outcome: "Five health checks classify every stored doc into PASS, WARN, or FAIL."
status: mapped
proof_mode: integration-test
depends_on: [library-schema-and-write-validation, migrate-on-write-upcaster]
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real packages/cli source (the
# health classifier lives in the CLI), so this capability is single-node `--live`-buildable. The ADR-0092
# brownfield `real:` arm was REMOVED (ADR-0094 supersedes_in_part 92 d.5): the library is `mapped`, so its
# green path is Adopt (the story's `## Reliability Gates`, ADR-0085), not a fail-closed `--real` Build.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
---

# Classify library health and separate gate failures from warnings

**Outcome —** Five health checks classify every stored doc into PASS, WARN, or FAIL.

*(The gate-vs-warn blocking — “only GATE-class FAILs gate, a WARN keeps `ok=true`” — was demoted out of the outcome to avoid a banned conjunction; it lives where it is proven, in contract 6 `gate-fails-vs-warn-does-not-gate`.)*

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** All five checks + the gate-vs-warn classification + the SEED gate are covered by REAL, passing, offline tests: `packages/cli/src/health.test.ts` (17 pure-function tests + 1 SEED gate test) is part of the `@storytree/cli` suite, which I ran. It observationally verifies the whole pure module AND wires two real collaborators (the health checks + the fixture loader `loadFixtureCorpus`) at `health.test.ts:191-203`. But storytree's prove-it-gate did NOT drive these red→green, so this is brownfield `mapped`, not `healthy`. No would-be contracts here — every leaf has a real test. The CLI WIRING that surfaces this (dashboard banner, `--check` report) is NOT in this capability — see [`library-cli`](library-cli.md).

## Guidance

One PURE module — now living at `packages/drive/src/health.ts` (relocated per the ADR-0112 drive-extraction pattern; `packages/cli/src/health.ts` remains as a thin re-export shim, so the registered proof paths below are unchanged) — surfaced three ways (a dashboard banner, the `--check` report, the ADR-0022 CI gate) — NOT a standalone doctor. Filesystem (`docExists`) and the generated-asset count are INJECTED via `HealthOpts` (`health.ts:33-42`) so it stays node-light and unit-testable offline.

The code edge for the `depends_on`: `health.ts:2` imports `upcastAndValidate` + `KIND_SPECS` from `@storytree/library`; schema-conformance (`health.ts:84-102`) literally calls `upcastAndValidate(bodyOf(d))` per structured doc (`health.ts:89`) — so it is a real consumer of BOTH the schema and migrate capabilities (it forwards-then-validates, which is why a doc that only needs upcasting still PASSes).

The five checks: schema-conformance / retired-field / version-floor are GATE-class (`GATE_CHECKS`, `health.ts:50-54`); referential-integrity (asset: dangling = FAIL hard break; doc: dangling = WARN soft) and count-reconciliation (WARN) are WARN-class and never gate. `STRUCTURED_KINDS` (`health.ts:65`) skips templates from the structured checks. `libraryHealth` (`health.ts:203-211`) runs all five; `libraryHealthCheap` (`health.ts:218-225`) drops the fs-heavy referential-integrity for the banner. `worstLevel` / `gateFailures` / `levelCounts` (`health.ts:228-253`) are the gate helpers: `gateFailures` returns only GATE-class FAILs, so a WARN keeps `ok=true` (the ADR-0022 merge contract). All offline, all proven.

## Integration test

**Goal —** Run the real health engine over the frozen FIXTURE corpus — `loadFixtureCorpus` into an `InMemoryStore`, `queryDocs`, then `libraryHealth` — and assert `gateFailures()` is EMPTY, proving the GATE-class checks classify a known-clean corpus correctly so the ADR-0022 `pnpm -r test` run enforces the health ENGINE offline.

Real collaborators, no stubs: the integration-flavoured proof is `packages/cli/src/health.test.ts:191-203` (passing): `loadFixtureCorpus` (the real `@storytree/library/fixture` loader) into a real `InMemoryStore`, `queryDocs`, then `libraryHealth` — asserts `gateFailures()` is EMPTY (schema-conformance + retired-field + version-floor all clean on the fixture). That is exactly what makes `pnpm -r test` (ADR-0022) enforce the health engine offline, wiring two real collaborators (the health checks + the fixture loader `loadFixtureCorpus`) with no stub.

**The subject is the JUDGE, not the corpus, and this wording was corrected on 2026-08-08 to say so.** It read "the REAL seed corpus … proving the stamped seed clears the GATE-class checks", which was true while `loadFixtureCorpus`'s ancestor read `apps/studio/data/knowledge.json` — the committed mirror of the live Library. ADR-0302 D1 deleted that file, and D3 makes the replacement a frozen 13-artifact literal that is "deliberately NOT a mirror and never reconciled, so it drifts by design". A green run here has therefore said nothing about corpus health since; on 2026-08-08 the live corpus was GATE-class RED on `version-floor` — ten docs below the schema floor, authored by no session then working — with this suite passing. `stories/cli/verification-decay-instruments.md` already classes this unit that way ("five checks over a frozen fixture corpus … facts about a JUDGE"), so the correction aligns the spec with a reading the tree had already settled. Live-corpus health is `storytree library --check`, an on-demand operator report that ADR-0026 §5 deliberately made no merge gate.

Underneath, 17 pure-function tests (`health.test.ts:70-187`, all passing) cover every level of all five checks plus the gate-vs-warn classification and the cheap-subset shape. `mapped` (observational); the prove-it-gate did not drive it.

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`schema-conformance-pass-fail-skip`** — schema-conformance PASSes valid structured docs, FAILs invalid ones, skips templates
   - **asserts —** A valid current-version structured doc => PASS; a structured doc missing a required field => FAIL naming the id; a template (kind not in `KIND_SPECS`) is not validated => PASS.
   - **covers —** `packages/cli/src/health.ts:84-102`
   - **proven by —** `packages/cli/src/health.test.ts:70-90` (REAL, passing)
2. **`retired-field-pass-fail`** — retired-field flags a stored body still carrying a denylisted field
   - **asserts —** No doc carrying `seeAlso` => PASS; a stored body carrying `seeAlso` => FAIL naming `seeAlso` (inspects the raw stored body, not the upcast form).
   - **covers —** `packages/cli/src/health.ts:105-117`
   - **proven by —** `packages/cli/src/health.test.ts:92-104` (REAL, passing)
3. **`version-floor-pass-fail`** — version-floor flags any structured doc below the current version
   - **asserts —** Every structured doc at `CURRENT_SCHEMA_VERSION` => PASS; a structured doc at `schemaVersion` 0 => FAIL naming the id.
   - **covers —** `packages/cli/src/health.ts:120-139`
   - **proven by —** `packages/cli/src/health.test.ts:106-116` (REAL, passing)
4. **`referential-integrity-levels`** — referential-integrity FAILs a dangling asset ref, WARNs a dangling doc ref, skips doc resolution without a resolver
   - **asserts —** All pointers resolve => PASS; a dangling `asset:` pointer => FAIL; a dangling `doc:` pointer (`docExists=false`) => WARN; no `docExists` injected => `doc:` pointers unchecked => PASS.
   - **covers —** `packages/cli/src/health.ts:142-169`
   - **proven by —** `packages/cli/src/health.test.ts:118-145` (REAL, passing)
5. **`count-reconciliation-levels`** — count-reconciliation PASSes on a match, WARNs on a mismatch, degrades to PASS without a count
   - **asserts —** `structuredCount === generatedAssetCount` => PASS; mismatch => WARN; `generatedAssetCount` undefined => PASS with a no-count note.
   - **covers —** `packages/cli/src/health.ts:172-196`
   - **proven by —** `packages/cli/src/health.test.ts:147-160` (REAL, passing)
6. **`gate-fails-vs-warn-does-not-gate`** — Gate helpers gate on a GATE-class FAIL but never on a WARN
   - **asserts —** A schema-conformance FAIL drives `worstLevel=FAIL`, `gateFailures=[schema-conformance]`, `levelCounts.fail=1`; a WARN-only break (dangling `doc:`) yields `worstLevel=WARN` but `gateFailures=[]`.
   - **covers —** `packages/cli/src/health.ts:228-253`
   - **proven by —** `packages/cli/src/health.test.ts:162-181` (REAL, passing)
7. **`cheap-omits-referential-integrity`** — The cheap runner omits the fs-heavy referential-integrity check
   - **asserts —** `libraryHealthCheap` returns no referential-integrity result but keeps schema-conformance.
   - **covers —** `packages/cli/src/health.ts:218-225`
   - **proven by —** `packages/cli/src/health.test.ts:183-187` (REAL, passing)
8. **`seed-gate-clean`** — The frozen fixture corpus has zero gate-class failures (id kept: renaming a contract re-points signed verdicts)
   - **asserts —** Loading the frozen fixture via `loadFixtureCorpus` into an `InMemoryStore` and running `libraryHealth` yields an empty `gateFailures()`. NOT a claim about the live corpus (ADR-0302 D3).
   - **covers —** `packages/cli/src/health.ts:203-211,238-240`
   - **proven by —** `packages/cli/src/health.test.ts:191-203` (REAL, passing)
