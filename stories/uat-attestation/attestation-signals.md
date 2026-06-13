---
id: "attestation-signals"
tier: capability
story: uat-attestation
title: "A per-test attestation is an append-only signed signal, never a gate verdict"
outcome: "A per-test attestation persists as an append-only signed signal (human or machine), with relayed-by provenance, separate from gate verdicts and never rolled up."
status: proposed
proof_mode: integration-test
depends_on: [uat-test-units]
---

# A per-test attestation is an append-only signed signal, never a gate verdict

**Outcome —** A per-test attestation persists as an append-only signed signal (human or machine),
with relayed-by provenance, separate from gate verdicts and never rolled up.

## Guidance

- New `events.attestation` family (house append-only pattern), keyed by **test id**:
  `{ testId, outcome, witness: 'human'|'machine', signer, at, note, relayedBy? }`. zod at the
  write boundary. Deliberately a DIFFERENT log from `events.verdict` — a vouch and a proof must not
  share a table (the conflation ADR-0044 forbids).
- Latest-signal-per-(testId,witness) projection for display; full history retained.
- A CLI/spine path records a relayed human attestation: `signer` = the operator identity,
  `relayedBy` = the agent/session — honest provenance for "owner vouched, agent scribed".
- Pure derivation (like `tree-verdicts`): `deriveAttestations(events)` → map keyed by test id; a
  malformed signal grants nothing (conservative parsing).

## Contracts (3)

1. **`separate-from-verdicts`** — attestations never touch the verdict log
   - **asserts —** recording an attestation writes `events.attestation` only; `events.verdict` is
     untouched; the derived gate-green map is unaffected.
2. **`signed-with-provenance`** — human signals carry signer + relayedBy
   - **asserts —** a relayed human attestation records signer (operator) and relayedBy (agent); a
     machine attestation records the runner; a malformed signal grants nothing.
3. **`no-story-rollup`** — attestations don't green the story
   - **asserts —** with every test of a story attested, no story-level verdict/hue is derived;
     attestations stay per-test.
