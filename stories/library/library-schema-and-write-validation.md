---
id: "library-schema-and-write-validation"
tier: capability
story: library
title: "Schema-defined library docs, validated at the write boundary"
outcome: "Every library artifact is zod-validated at the write boundary against a single per-kind schema source of truth."
status: mapped
proof_mode: integration-test
depends_on: []
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real packages/library source,
# so this capability is single-node `--live`-buildable. The ADR-0092 brownfield `real:` arm was REMOVED
# (ADR-0094 supersedes_in_part 92 d.5): the library is `mapped`, so its green path is Adopt (the story's
# `## Reliability Gates`, ADR-0085), not a fail-closed `--real` Build over a mature artifact with no red.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/**/*.ts"]
---

# Schema-defined library docs, validated at the write boundary

**Outcome —** Every library artifact is zod-validated at the write boundary against a single per-kind schema source of truth.

**Depends on —** (root — no within-story upstream)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** This is the schema root the whole tier stands on, and it is genuinely covered: `packages/library/src/library-doc.test.ts:13-66` (4 cases) and `packages/library/src/store/store.test.ts:50-61` (2 cases) are REAL, passing, offline tests I ran (part of the `@storytree/library` suite, 99 pass + 1 live-gated skip). They observationally verify the validator. But storytree's own prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) did NOT drive them red→green — they are pre-existing target-repo tests, so this is brownfield `mapped`, weaker than `healthy`. One contract below (`strict-rejects-extra-key-on-valid-doc`) is a **would-be** test — no committed assertion isolates the `.strict()` extra-key rejection on an otherwise-valid structured doc; it is only transitively exercised by the migrate suite's seeAlso case.

## Guidance

This is the schema root the whole tier stands on. `KIND_SPECS` (`packages/library/src/knowledge.ts:75-459`) is the SINGLE source of truth: one ordered field table per structured kind (definition / principle / pattern / guardrail / techstack / process / open-question / agent / proposal). `buildKindSchema` (`knowledge.ts:519-537`) derives a `.strict()` zod object per kind from it, and `Knowledge` (`knowledge.ts:550-560`) is the `discriminatedUnion('kind')` over the nine. The write boundary widens that to `LibraryDoc = union(Knowledge, LibraryAsset)` (`library-doc.ts:47`): a `LibraryAsset` (`library-doc.ts:20-31`) is a rendered, body-bearing artifact (templates + previously-edited units) whose `category` is a free string. `validateLibraryDoc` (`library-doc.ts:56-58`) is the loud boundary — `LibraryDoc.parse` throws on malformed input.

Two non-obvious traps for a rebuilder: (a) `commonShape.schemaVersion` (`knowledge.ts:493`) is optional-with-default(0), so `.strict()` still accepts a legacy doc that never carried it; (b) the structured schemas are `.strict()`, so unknown keys throw — which is exactly why a stray retired field (`seeAlso`) is rejected by *bare* validation and must be upcast first (see [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)). No DB, no API key — pure zod, fully offline.

## Integration test

**Goal —** Run the real zod schemas (`knowledge.ts`) through the real `validateLibraryDoc` boundary (`library-doc.ts`) with NO stubs, proving that the per-kind schema source of truth accepts every legitimate artifact shape and loudly rejects malformed input.

The integration test exercises this capability against its **real in-story collaborators** — the zod schemas wired through `validateLibraryDoc`, no stubs (ADR-0010 §2/§5). The REAL passing tests that play this role today:

- `packages/library/src/library-doc.test.ts:13-66` (4 cases): a well-formed structured `principle` round-trips with its `kind` discriminator intact (`library-doc.test.ts:13-27`); a generated `template` artifact validates via the `LibraryAsset` branch (`library-doc.test.ts:29-42`); a general edited `definition`-category body asset validates via the same branch (`library-doc.test.ts:44-60`); and three malformed inputs (principle missing fields, unknown kind, body asset missing body/title) all throw (`library-doc.test.ts:62-66`).
- `packages/library/src/store/store.test.ts:50-61` adds a second real-collaborator touch: `validateLibraryDoc` is run against the FIRST real unit read off `apps/studio/data/knowledge.json` (`store.test.ts:50-55`) and rejects garbage (`store.test.ts:57-61`).

These are real passing tests, observational (`mapped`) — storytree's prove-it-gate did not drive them.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`accepts-structured-knowledge-unit`** — A well-formed structured Knowledge unit validates with its kind intact
   - **asserts —** `validateLibraryDoc` on a complete `principle` (statement / why / howToApply + common fields) returns it and `'kind' === 'principle'`.
   - **covers —** `packages/library/src/library-doc.ts:56-58`
   - **proven by —** `packages/library/src/library-doc.test.ts:13-27` (REAL, passing)
2. **`accepts-generated-template-asset`** — A generated template artifact validates via the LibraryAsset branch
   - **asserts —** `validateLibraryDoc` on a `category:'template'` body-bearing doc (no structured kind) returns it and `'category' === 'template'`.
   - **covers —** `packages/library/src/library-doc.ts:20-31,47`
   - **proven by —** `packages/library/src/library-doc.test.ts:29-42` (REAL, passing)
3. **`accepts-edited-asset-any-category`** — An edited body asset of any non-template category validates via the same branch
   - **asserts —** `validateLibraryDoc` on a `category:'definition'` body-bearing asset returns it with category preserved and a string body.
   - **covers —** `packages/library/src/library-doc.ts:20-31`
   - **proven by —** `packages/library/src/library-doc.test.ts:44-60` (REAL, passing)
4. **`throws-on-malformed-input`** — Malformed input throws at the loud write boundary
   - **asserts —** `validateLibraryDoc` throws on a principle missing required fields, on an unknown kind, and on a body asset missing body/title.
   - **covers —** `packages/library/src/library-doc.ts:47-58`; `packages/library/src/knowledge.ts:530-536`
   - **proven by —** `packages/library/src/library-doc.test.ts:62-66` (REAL, passing)
5. **`validates-a-real-corpus-unit`** — A real knowledge.json unit validates and garbage is rejected
   - **asserts —** `validateLibraryDoc` accepts the first real unit from `apps/studio/data/knowledge.json` (id is a string, has a string kind) and throws on `{nope:true}`, `null`, and an unknown kind.
   - **covers —** `packages/library/src/library-doc.ts:56-58`
   - **proven by —** `packages/library/src/store/store.test.ts:50-61` (REAL, passing)
6. **`strict-rejects-extra-key-on-valid-doc`** — An extra key on an otherwise-valid structured doc is rejected by `.strict()`
   - **asserts —** `validateLibraryDoc` throws when a fully valid structured unit carries one unknown top-level key (the `.strict()` guarantee, isolated).
   - **covers —** `packages/library/src/knowledge.ts:530-536`
   - **would-be test —** no committed assertion isolates this; today the `.strict()` rejection is only transitively exercised by the migrate suite's stray-`seeAlso` case.
