---
id: "uat-test-units"
tier: capability
story: uat-attestation
title: "A story's UAT becomes stable, addressable test units with a witness kind"
outcome: "A story's UAT steps become stable, addressable test units, each declaring whether a human, a machine, or either can attest it."
status: proposed
proof_mode: integration-test
depends_on: []
---

# A story's UAT becomes stable, addressable test units with a witness kind

**Outcome —** A story's UAT steps become stable, addressable test units, each declaring whether a
human, a machine, or either can attest it.

## Guidance

- Formalise the "Story UAT (would-be)" prose into structured units: a `uatTests` list in the story
  spec (or a derived parse), each `{ id, title, witness: 'human'|'machine'|'either' }` with a
  stable id (e.g. `<story>#uat-<n>`). zod-validated in `@storytree/core`.
- Pure, no I/O: a parser/validator + the witness enum; the id scheme is the join key the
  attestation log writes against.
- Backward-compatible: a story with only prose UAT still loads (tests default to `either` /
  derived), so existing stories don't break.

## Contracts (2)

1. **`stable-addressable-tests`** — UAT resolves to ids
   - **asserts —** a story's UAT yields stable, unique test ids with titles; re-parsing is stable.
2. **`witness-kind-validated`** — each test declares who may attest
   - **asserts —** witness is one of human|machine|either; an invalid value is refused; absent
     defaults conservatively.
