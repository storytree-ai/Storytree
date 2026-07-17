---
id: "criterion-detail-hash-anchor"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "A detail content-hash anchors green and invalidates on substantive change"
outcome: "A verdict records the detail artifact's content hash; a substantive body change yields a different hash that classifies the prior green as stale."
status: proposed
proof_mode: integration-test
depends_on: [criterion-detail-pointer]
decisions: [209, 192]
# Node-borne proof config (ADR-0057 / ADR-0192). NET-NEW pure hash + stale classifier in
# packages/uat-criterion. Later model-judged-uat / human attestation consume the hash when signing;
# this leaf proves the hash+stale contract offline without a live judge or verdict store.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/detail-hash.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/detail-hash.ts"]
  real:
    testFile: "packages/uat-criterion/src/detail-hash.test.ts"
    sourceFile: "packages/uat-criterion/src/detail-hash.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/detail-hash.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/detail-hash.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# A detail content-hash anchors green and invalidates on substantive change

**Outcome —** A verdict records the detail artifact's content hash; a substantive body change yields
a different hash that classifies the prior green as stale.

## Guidance

- Author `packages/uat-criterion/src/detail-hash.ts`: a pure content-hash over the detail artifact's
  **proof-bearing** fields (action / success / evidence / refs — the body `uat-detail-kind` defines)
  plus a classifier `fresh | stale` given a previously recorded hash.
- **Substantive change (ADR-0209 D6):** any change to those proof-bearing fields MUST change the
  hash. Volatile metadata (timestamps, actor stamps) MUST NOT participate — otherwise every sync
  would false-stale green.
- **Display title is not in the hash:** the story-owned one-liner is display-canonical and lives on
  the criterion, not in the hashed detail body (ADR-0209 D6). Hashing the title would either couple
  display renames to re-attestation incorrectly or tempt putting the title on the detail.
- **Record shape:** export a small anchor record `{ detailArtifactId, contentHash }` suitable for a
  later model/human UAT verdict to embed. This leaf does NOT write verdicts, talk to the
  orchestrator, or reopen `binding-staleness` — it proves the detail-specific hash contract the
  later `model-judged-uat` increment will record when signing.
- **Stale classification:** `classifyDetailAnchor(priorHash, currentDetail) → fresh | stale`. Equal
  hashes → fresh; unequal → stale. No third "drifted-undescribed" state required here (that is
  binding-staleness's code-span vocabulary).
- Pure, deterministic, no I/O. Prefer the repo's existing hash helper if importing it keeps this
  package's dependency graph honest; otherwise a local stable hash of a canonical serialization is
  fine — pin the algorithm in the test so it cannot silently change.

## Contracts (3)

1. **`detail-hash-stable-for-identical-body`** — identical proof-bearing bodies share a hash
   - **asserts —** hashing the same detail twice yields the same content hash; reordering-equivalent
     canonicalization (if any) is pinned by the test.
2. **`detail-hash-changes-on-substantive-edit`** — a proof-bearing field edit changes the hash
   - **asserts —** editing action, success, evidence, or refs yields a different hash; the prior
     hash is classified `stale` against the edited body.
3. **`detail-anchor-records-id-and-hash`** — the record a verdict will embed is complete
   - **asserts —** building an anchor from a pointed-to detail carries both `detailArtifactId` and
     `contentHash`, sufficient for a later signed verdict to detect staleness without re-reading
     story prose.
