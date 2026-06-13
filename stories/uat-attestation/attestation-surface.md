---
id: "attestation-surface"
tier: capability
story: uat-attestation
title: "The story detail shows each UAT test's attestation, human distinct from machine"
outcome: "The story detail (panel + CLI) shows each UAT test's attestation mark, human distinct from machine, never the gate-green hue."
status: proposed
proof_mode: integration-test
depends_on: [attestation-signals]
---

# The story detail shows each UAT test's attestation, human distinct from machine

**Outcome —** The story detail (panel + CLI) shows each UAT test's attestation mark, human distinct
from machine, never the gate-green hue.

## Guidance

- The studio story panel grows a "UAT tests" list: each test row shows its title, witness kind, and
  its attestation mark — human = the ADR-0040 human-witness seal, machine = a distinct mark,
  un-attested = blank. The world island hue is untouched (story-grained; ADR-0044 d.3).
- `storytree tree <story>` gains the same per-test column (advisory, silently absent offline like
  the verdict glyphs).
- Reuses the world's css classes for the seal so it can't drift from the signpost vocabulary; the
  marks are deliberately NOT the crown-green hue (a vouch is not a proof).

## Contracts (2)

1. **`per-test-marks-distinct`** — human, machine, and blank read differently, none is gate-green
   - **asserts —** a human-attested test renders the seal, a machine one its mark, an un-attested
     one blank; none uses the gate-proven green hue.
2. **`detail-only-no-island-change`** — marks live in detail, not the world hue
   - **asserts —** rendering attestations changes the panel/CLI only; the island's status hue is
     unchanged by any attestation.
