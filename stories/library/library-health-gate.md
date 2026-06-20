---
id: "library-health-gate"
tier: capability
story: library
title: "Classify library health and separate gate failures from warnings"
outcome: "Five health checks classify every stored doc into PASS, WARN, or FAIL."
status: mapped
proof_mode: integration-test
depends_on: [library-schema-and-write-validation, migrate-on-write-upcaster]
---

# Classify library health and separate gate failures from warnings

**Outcome —** Five health checks classify every stored doc into PASS, WARN, or FAIL.

*(The gate-vs-warn blocking — “only GATE-class FAILs gate, a WARN keeps `ok=true`” — was demoted out of the outcome to avoid a banned conjunction; it lives where it is proven, in contract 6 `gate-fails-vs-warn-does-not-gate`.)*

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** All five checks + the gate-vs-warn classification + the SEED gate are covered by REAL, passing, offline tests: `packages/cli/src/health.test.ts` (17 pure-function tests + 1 SEED gate test) is part of the `@storytree/cli` suite, which I ran. It observationally verifies the whole pure module AND wires two real collaborators (the health checks + the store's `loadCorpus`) at `health.test.ts:191-203`. But storytree's prove-it-gate did NOT drive these red→green, so this is brownfield `mapped`, not `healthy`. No would-be contracts here — every leaf has a real test. The CLI WIRING that surfaces this (dashboard banner, `--check` report) is NOT in this capability — see [`library-cli`](library-cli.md).

## Guidance

One PURE module (`packages/cli/src/health.ts`) surfaced three ways (a dashboard banner, the `--check` report, the ADR-0022 CI gate) — NOT a standalone doctor. Filesystem (`docExists`) and the generated-asset count are INJECTED via `HealthOpts` (`health.ts:33-42`) so it stays node-light and unit-testable offline.

The code edge for the `depends_on`: `health.ts:2` imports `upcastAndValidate` + `KIND_SPECS` from `@storytree/library`; schema-conformance (`health.ts:84-102`) literally calls `upcastAndValidate(bodyOf(d))` per structured doc (`health.ts:89`) — so it is a real consumer of BOTH the schema and migrate capabilities (it forwards-then-validates, which is why a doc that only needs upcasting still PASSes).

The five checks: schema-conformance / retired-field / version-floor are GATE-class (`GATE_CHECKS`, `health.ts:50-54`); referential-integrity (asset: dangling = FAIL hard break; doc: dangling = WARN soft) and count-reconciliation (WARN) are WARN-class and never gate. `STRUCTURED_KINDS` (`health.ts:65`) skips templates from the structured checks. `libraryHealth` (`health.ts:203-211`) runs all five; `libraryHealthCheap` (`health.ts:218-225`) drops the fs-heavy referential-integrity for the banner. `worstLevel` / `gateFailures` / `levelCounts` (`health.ts:228-253`) are the gate helpers: `gateFailures` returns only GATE-class FAILs, so a WARN keeps `ok=true` (the ADR-0022 merge contract). All offline, all proven.

## Integration test

**Goal —** Run the real health engine over the REAL seed corpus — `loadCorpus` into an `InMemoryStore`, `queryDocs`, then `libraryHealth` — and assert `gateFailures()` is EMPTY, proving the stamped seed clears the GATE-class checks so the ADR-0022 `pnpm -r test` run enforces migration/seed health offline.

Real collaborators, no stubs: the integration-flavoured proof is `packages/cli/src/health.test.ts:191-203` (passing): `loadCorpus` (the real `@storytree/library/store` seeder) into a real `InMemoryStore`, `queryDocs`, then `libraryHealth` — asserts `gateFailures()` is EMPTY (schema-conformance + retired-field + version-floor all clean on the stamped seed). That is exactly what makes `pnpm -r test` (ADR-0022) enforce migration/seed health offline, wiring two real collaborators (the health checks + the store's `loadCorpus`) with no stub.

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
8. **`seed-gate-clean`** — The stamped seed corpus has zero gate-class failures
   - **asserts —** Loading the real corpus via `loadCorpus` into an `InMemoryStore` and running `libraryHealth` yields an empty `gateFailures()`.
   - **covers —** `packages/cli/src/health.ts:203-211,238-240`
   - **proven by —** `packages/cli/src/health.test.ts:191-203` (REAL, passing)
