---
id: "library-health-gate"
tier: capability
story: library
title: "Classify library health and separate gate failures from warnings"
outcome: "Four health checks classify every stored doc into PASS, WARN, or FAIL."
status: proposed
proof_mode: integration-test
depends_on: [library-schema-and-write-validation, migrate-on-write-upcaster]
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real packages/cli source (the
# health classifier lives in the CLI), so this capability is single-node `--live`-buildable. The earlier
# `real:` arm was REMOVED by ADR-0094. ADR-0395 now records this greenfield unit without a current signed
# pass as `proposed`; registration order does not make it brownfield or Adopt-bound.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
---

# Classify library health and separate gate failures from warnings

**Outcome —** Four health checks classify every stored doc into PASS, WARN, or FAIL.

*(The gate-vs-warn blocking — “only GATE-class FAILs gate, a WARN keeps `ok=true`” — was demoted out of the outcome to avoid a banned conjunction; it lives where it is proven, in contract 5 `gate-fails-vs-warn-does-not-gate`.)*

*(**FOUR, not five, since 2026-08-08.** The count was five while `count-reconciliation` compared the store against the generated `apps/studio/data/assets.json`. ADR-0210 deleted that file "and with it … the `count-reconciliation` health check" — and NOTHING replaced it, because the count had no subject once the thing it counted against was gone. `libraryHealth()` returns exactly four results. The dead contract 5 `count-reconciliation-levels` was removed here in the same pass, since a capability listing a contract for a check that does not exist claims a proof obligation it cannot meet.)*

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `proposed` (real passing offline tests, observational; NOT `healthy`).** All four checks + the gate-vs-warn classification + the fixture gate are covered by REAL, passing, offline tests: `packages/cli/src/health.test.ts` (20 pure-function tests + 1 fixture-gate test, 21 in all) is part of the `@storytree/cli` suite, which I ran. It observationally verifies the whole pure module AND wires two real collaborators (the health checks + the fixture loader `loadFixtureCorpus`) in the test **“FIXTURE gate: the frozen fixture corpus has NO gate failures (schema/retired/version clean)”**. Storytree's prove-it-gate did NOT drive these red→green, but this is greenfield Storytree work, so ADR-0395 keeps its unsigned authored baseline at `proposed`. No would-be contracts here — every leaf has a real test. The CLI WIRING that surfaces this (dashboard banner, `--check` report) is NOT in this capability — see [`library-cli`](library-cli.md).

## Guidance

One PURE module — now living at `packages/drive/src/health.ts` (relocated per the ADR-0112 drive-extraction pattern; `packages/cli/src/health.ts` remains as a thin re-export shim, so the registered proof paths below are unchanged) — surfaced three ways (a dashboard banner, the `--check` report, the ADR-0022 CI gate) — NOT a standalone doctor. All three out-of-library resolvers — the filesystem resolver (`docExists`), the node resolver (`nodeExists`), and the work-unit resolver (`workUnitTier`, ADR-0306 D1) — are INJECTED via the `HealthOpts` interface so it stays node-light and unit-testable offline.

The code edge for the `depends_on`: `packages/drive/src/health.ts` imports `upcastAndValidate` + `KIND_SPECS` from `@storytree/library`; `schemaConformance()` literally calls `upcastAndValidate(bodyOf(d))` per structured doc — so it is a real consumer of BOTH the schema and migrate capabilities (it forwards-then-validates, which is why a doc that only needs upcasting still PASSes).

The four checks: `schemaConformance()` / `retiredField()` / `versionFloor()` are GATE-class (the `GATE_CHECKS` set); `referentialIntegrity()` is the one WARN-class check and never gates — a dangling `asset:` is a FAIL hard break, while a dangling `doc:`, `node:`, or (since ADR-0306 D1) an increment's `cites` token `story:`/`capability:` resolved through the injected `workUnitTier` is WARN soft, and a `cites` id that EXISTS at the other tier is reported as its own distinct tier-mismatch fault rather than as absence. ADR-0306 added a resolver ARGUMENT, not a fifth check: `libraryHealth()` still returns four. The `STRUCTURED_KINDS` set skips templates from the structured checks. `libraryHealth()` runs all four; `libraryHealthCheap()` drops the fs-heavy referential-integrity for the banner. `worstLevel()` / `gateFailures()` / `levelCounts()` are the gate helpers: `gateFailures` returns only GATE-class FAILs, so a WARN keeps `ok=true` (the ADR-0022 merge contract). All offline, all proven.

*(There was a fifth, `count-reconciliation` — WARN-class, comparing the structured-doc count to the generated `assets.json` count. ADR-0210 deleted the file and the check together, with no replacement; `health.ts` records that in-code at both `libraryHealth` and `libraryHealthCheap`.)*

**No line number in this file points at live code, deliberately** — the only range quoted below is the dead one, as the thing being described. Every live reference names a SYMBOL or a bare file. Until 2026-08-08 this section and all eight contracts cited `packages/cli/src/health.ts:84-253` — ranges that cannot exist, because that path has been a 16-line re-export shim since the ADR-0112 extraction, and which did not match the real drive module either. Nothing machine-resolves a `covers:`/`proven by:` path or line (they are captured as free-form obligation TEXT), so the rot was silent. A symbol name moves with its code; a line number does not.

## Integration test

**Goal —** Run the real health engine over the frozen FIXTURE corpus — `loadFixtureCorpus` into an `InMemoryStore`, `queryDocs`, then `libraryHealth` — and assert `gateFailures()` is EMPTY, proving the GATE-class checks classify a known-clean corpus correctly so the ADR-0022 `pnpm -r test` run enforces the health ENGINE offline.

Real collaborators, no stubs: the integration-flavoured proof is `packages/cli/src/health.test.ts`, test **“FIXTURE gate: the frozen fixture corpus has NO gate failures (schema/retired/version clean)”** (passing): `loadFixtureCorpus` (the real `@storytree/library/fixture` loader) into a real `InMemoryStore`, `queryDocs`, then `libraryHealth` — asserts `gateFailures()` is EMPTY (schema-conformance + retired-field + version-floor all clean on the fixture). That is exactly what makes `pnpm -r test` (ADR-0022) enforce the health engine offline, wiring two real collaborators (the health checks + the fixture loader `loadFixtureCorpus`) with no stub.

**The subject is the JUDGE, not the corpus, and this wording was corrected on 2026-08-08 to say so.** It read "the REAL seed corpus … proving the stamped seed clears the GATE-class checks", which was true while `loadFixtureCorpus`'s ancestor read `apps/studio/data/knowledge.json` — the committed mirror of the live Library. ADR-0302 D1 deleted that file, and D3 makes the replacement a frozen 13-artifact literal that is "deliberately NOT a mirror and never reconciled, so it drifts by design". A green run here has therefore said nothing about corpus health since; on 2026-08-08 the live corpus was GATE-class RED on `version-floor` — ten docs below the schema floor, authored by no session then working — with this suite passing. `stories/cli/verification-decay-instruments.md` already classes this unit that way ("four checks over a frozen fixture corpus … facts about a JUDGE"), so the correction aligns the spec with a reading the tree had already settled. Live-corpus health is `storytree library --check`, an on-demand operator report that ADR-0026 §5 deliberately made no merge gate.

Underneath, 20 pure-function tests in the same file (all passing) cover every level of all four checks plus the gate-vs-warn classification and the cheap-subset shape. `proposed` (greenfield, observationally tested, without a current signed pass).

## Contracts (7)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Every contract here has a REAL passing test (`proven by`).

**Read the citation pair before editing one.** `covers:` names `packages/cli/src/health.ts` — the ADR-0112 re-export shim — because that is the file this capability's proof actually scopes: `proof.command` is `pnpm --filter @storytree/cli test` with `sourceGlobs: ["packages/cli/src/**/*.ts"]`, `health.test.ts` imports `./health.js`, so a broken re-export reds the suite at IMPORT time. `repo-manifest.json` declares that same path → `library-health-gate` and that declaration is correct; do NOT re-point these wholesale at `packages/drive/src/health.ts`. Beside it each contract names the **implementing symbol** in `packages/drive/src/health.ts`, where the behaviour lives. `proven by:` names the test-name STRING — greppable, and it survives any edit above it. Both halves are true, and the pair is what stops the next reader re-rotting this: eight contracts previously cited line ranges in a 16-line shim.

**Was eight; contract 5 `count-reconciliation-levels` was removed on 2026-08-08 and the survivors renumbered.** It asserted a `count-reconciliation` check ADR-0210 deleted along with `apps/studio/data/assets.json`, and nothing replaced it — so there is no substitute contract to write. Every surviving slug is byte-identical to what it was. Ordinals are safe to close up: `packages/library/src/contracts.ts` reads a contract's identity off the bold code-span on the item lead and comments that the `(N)` in this heading "is decoration" — so the positional-id rule that governs UAT criteria (`asset:edit-story-uat-criteria`) does NOT reach contracts. Renaming a slug would still re-point signed verdicts; renumbering does not.

1. **`schema-conformance-pass-fail-skip`** — schema-conformance PASSes valid structured docs, FAILs invalid ones, skips templates
   - **asserts —** A valid current-version structured doc => PASS; a structured doc missing a required field => FAIL naming the id; a template (kind not in `KIND_SPECS`) is not validated => PASS.
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `schemaConformance()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, tests **“schema-conformance PASS on a valid current-version structured doc”**, **“schema-conformance FAIL on a structured doc missing a required field”**, **“schema-conformance skips non-structured (template) docs”** (REAL, passing)
2. **`retired-field-pass-fail`** — retired-field flags a stored body still carrying a denylisted field
   - **asserts —** No doc carrying `seeAlso` => PASS; a stored body carrying `seeAlso` => FAIL naming `seeAlso` (inspects the raw stored body, not the upcast form).
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `retiredField()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, tests **“retired-field PASS when no doc carries a retired field”**, **“retired-field FAIL when a doc still carries 'seeAlso' in its stored body”** (REAL, passing)
3. **`version-floor-pass-fail`** — version-floor flags any structured doc below the current version
   - **asserts —** Every structured doc at `CURRENT_SCHEMA_VERSION` => PASS; a structured doc at `schemaVersion` 0 => FAIL naming the id.
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `versionFloor()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, tests **“version-floor PASS when every structured doc is at the current version”**, **“version-floor FAIL when a structured doc sits below the current version”** (REAL, passing)
4. **`referential-integrity-levels`** — referential-integrity FAILs a dangling asset ref, WARNs a dangling doc ref, skips doc resolution without a resolver
   - **asserts —** All pointers resolve => PASS; a dangling `asset:` pointer => FAIL; a dangling `doc:` pointer (`docExists=false`) => WARN; no `docExists` injected => `doc:` pointers unchecked => PASS.
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `referentialIntegrity()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, tests **“referential-integrity PASS when every pointer resolves”**, **“referential-integrity FAIL on a dangling asset: pointer (a real graph break)”**, **“referential-integrity WARN on a dangling doc: pointer (softer — a doc can move)”**, **“referential-integrity skips doc: resolution when no docExists is injected”** (REAL, passing). Six further tests prove the same symbol's other tokens, which this contract's `asserts` predate and do NOT claim — recorded here so the coverage is visible without widening the claim. The `node:` token (ADR-0107 D2): **“referential-integrity WARNs on a dangling node: pointer (ADR-0107 D2's third token)”**, **“referential-integrity PASSes a resolving node: pointer, and skips it with no resolver”**. The `story:`/`capability:` `cites` tokens (ADR-0306 D1): **“referential-integrity WARNs on a story:/capability: ref this checkout cannot resolve”**, **“referential-integrity reports a TIER MISMATCH as its own fault, not as absence”**, **“cites resolution is SKIPPED with no workUnitTier injected — never failed”**, **“a resolving cites list passes, and a dangling asset: inside cites is still a FAIL”**.
5. **`gate-fails-vs-warn-does-not-gate`** — Gate helpers gate on a GATE-class FAIL but never on a WARN
   - **asserts —** A schema-conformance FAIL drives `worstLevel=FAIL`, `gateFailures=[schema-conformance]`, `levelCounts.fail=1`; a WARN-only break (dangling `doc:`) yields `worstLevel=WARN` but `gateFailures=[]`.
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `worstLevel()` / `gateFailures()` / `levelCounts()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, tests **“worstLevel / gateFailures / levelCounts agree on a FAIL-class break”**, **“gateFailures is EMPTY when only a WARN-class check is non-green”** (REAL, passing)
6. **`cheap-omits-referential-integrity`** — The cheap runner omits the fs-heavy referential-integrity check
   - **asserts —** `libraryHealthCheap` returns no referential-integrity result but keeps schema-conformance.
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `libraryHealthCheap()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, test **“libraryHealthCheap omits the fs-heavy referential-integrity check”** (REAL, passing)
7. **`seed-gate-clean`** — The frozen fixture corpus has zero gate-class failures (id kept: renaming a contract re-points signed verdicts)
   - **asserts —** Loading the frozen fixture via `loadFixtureCorpus` into an `InMemoryStore` and running `libraryHealth` yields an empty `gateFailures()`. NOT a claim about the live corpus (ADR-0302 D3).
   - **covers —** `packages/cli/src/health.ts` (the proof-scoped re-export shim) → `libraryHealth()` + `gateFailures()` in `packages/drive/src/health.ts`
   - **proven by —** `packages/cli/src/health.test.ts`, test **“FIXTURE gate: the frozen fixture corpus has NO gate failures (schema/retired/version clean)”** (REAL, passing)
