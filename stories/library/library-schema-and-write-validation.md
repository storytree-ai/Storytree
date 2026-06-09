---
id: "library-schema-and-write-validation"
tier: capability
story: library
title: "Schema-defined library docs, validated at the write boundary"
outcome: "Every library artifact is zod-validated at the write boundary against a single per-kind schema source of truth."
status: mapped
proof_mode: integration-test
depends_on: []
---

# Schema-defined library docs, validated at the write boundary

**Outcome —** Every library artifact is zod-validated at the write boundary against a single per-kind schema source of truth.

**Depends on —** (root — no within-story upstream)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** This is the schema root the whole tier stands on, and it is genuinely covered: `packages/core/src/store.test.ts:42-95` (4 cases) and `packages/store/src/store.test.ts:43-54` (2 cases) are REAL, passing, offline tests I ran (part of `@storytree/core` 48/48 and `@storytree/store` 16-pass). They observationally verify the validator. But storytree's own prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) did NOT drive them red→green — they are pre-existing target-repo tests, so this is brownfield `mapped`, weaker than `healthy`. One contract below (`strict-rejects-extra-key-on-valid-doc`) is a **would-be** test — no committed assertion isolates the `.strict()` extra-key rejection on an otherwise-valid structured doc; it is only transitively exercised by the migrate suite's seeAlso case.

## Guidance

This is the schema root the whole tier stands on. `KIND_SPECS` (`packages/core/src/knowledge.ts:64-254`) is the SINGLE source of truth: one ordered field table per structured kind (definition / principle / pattern / guardrail / techstack / open-question). `buildKindSchema` (`knowledge.ts:304-316`) derives a `.strict()` zod object per kind from it, and `Knowledge` (`knowledge.ts:326-333`) is the `discriminatedUnion('kind')` over the six. The write boundary widens that to `LibraryDoc = union(Knowledge, LibraryAsset)` (`store.ts:199`): a `LibraryAsset` (`store.ts:172-184`) is a rendered, body-bearing artifact (templates + previously-edited units) whose `category` is a free string. `validateLibraryDoc` (`store.ts:208-210`) is the loud boundary — `LibraryDoc.parse` throws on malformed input.

Two non-obvious traps for a rebuilder: (a) `commonShape.schemaVersion` (`knowledge.ts:288`) is optional-with-default(0), so `.strict()` still accepts a legacy doc that never carried it; (b) the structured schemas are `.strict()`, so unknown keys throw — which is exactly why a stray retired field (`seeAlso`) is rejected by *bare* validation and must be upcast first (see [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)). No DB, no API key — pure zod, fully offline.

## Integration test

**Goal —** Run the real zod schemas (`knowledge.ts`) through the real `validateLibraryDoc` boundary (`store.ts`) with NO stubs, proving that the per-kind schema source of truth accepts every legitimate artifact shape and loudly rejects malformed input.

The integration test exercises this capability against its **real in-story collaborators** — the zod schemas wired through `validateLibraryDoc`, no stubs (ADR-0010 §2/§5). The REAL passing tests that play this role today:

- `packages/core/src/store.test.ts:42-95` (4 cases): a well-formed structured `principle` round-trips with its `kind` discriminator intact (`store.test.ts:42-56`); a generated `template` artifact validates via the `LibraryAsset` branch (`store.test.ts:58-71`); a general edited `definition`-category body asset validates via the same branch (`store.test.ts:73-89`); and three malformed inputs (principle missing fields, unknown kind, body asset missing body/title) all throw (`store.test.ts:91-95`).
- `packages/store/src/store.test.ts:43-54` adds a second real-collaborator touch: `validateLibraryDoc` is run against the FIRST real unit read off `apps/studio/data/knowledge.json` (`store.test.ts:43-48`) and rejects garbage (`store.test.ts:50-54`).

These are real passing tests, observational (`mapped`) — storytree's prove-it-gate did not drive them.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`accepts-structured-knowledge-unit`** — A well-formed structured Knowledge unit validates with its kind intact
   - **asserts —** `validateLibraryDoc` on a complete `principle` (statement / why / howToApply + common fields) returns it and `'kind' === 'principle'`.
   - **covers —** `packages/core/src/store.ts:208-210`
   - **proven by —** `packages/core/src/store.test.ts:42-56` (REAL, passing)
2. **`accepts-generated-template-asset`** — A generated template artifact validates via the LibraryAsset branch
   - **asserts —** `validateLibraryDoc` on a `category:'template'` body-bearing doc (no structured kind) returns it and `'category' === 'template'`.
   - **covers —** `packages/core/src/store.ts:172-184,199`
   - **proven by —** `packages/core/src/store.test.ts:58-71` (REAL, passing)
3. **`accepts-edited-asset-any-category`** — An edited body asset of any non-template category validates via the same branch
   - **asserts —** `validateLibraryDoc` on a `category:'definition'` body-bearing asset returns it with category preserved and a string body.
   - **covers —** `packages/core/src/store.ts:172-184`
   - **proven by —** `packages/core/src/store.test.ts:73-89` (REAL, passing)
4. **`throws-on-malformed-input`** — Malformed input throws at the loud write boundary
   - **asserts —** `validateLibraryDoc` throws on a principle missing required fields, on an unknown kind, and on a body asset missing body/title.
   - **covers —** `packages/core/src/store.ts:199-210`; `packages/core/src/knowledge.ts:309-315`
   - **proven by —** `packages/core/src/store.test.ts:91-95` (REAL, passing)
5. **`validates-a-real-corpus-unit`** — A real knowledge.json unit validates and garbage is rejected
   - **asserts —** `validateLibraryDoc` accepts the first real unit from `apps/studio/data/knowledge.json` (id is a string, has a string kind) and throws on `{nope:true}`, `null`, and an unknown kind.
   - **covers —** `packages/core/src/store.ts:208-210`
   - **proven by —** `packages/store/src/store.test.ts:43-54` (REAL, passing)
6. **`strict-rejects-extra-key-on-valid-doc`** — An extra key on an otherwise-valid structured doc is rejected by `.strict()`
   - **asserts —** `validateLibraryDoc` throws when a fully valid structured unit carries one unknown top-level key (the `.strict()` guarantee, isolated).
   - **covers —** `packages/core/src/knowledge.ts:309-315`
   - **would-be test —** no committed assertion isolates this; today the `.strict()` rejection is only transitively exercised by the migrate suite's stray-`seeAlso` case.
