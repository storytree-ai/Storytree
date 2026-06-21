---
id: "attestation-surface"
tier: capability
story: uat-attestation
title: "The story detail shows each UAT test's proven verdict distinct from its lower-rigor vouch"
outcome: "The story detail (panel + CLI) shows each UAT test as two distinct marks — a PROVEN verdict (the real signed gate state that can green the story) and a lower-rigor VOUCH (never green) — alongside the witness kind that gates who may prove it."
status: proposed
proof_mode: integration-test
depends_on: [attestation-signals]
decisions: [44, 82]
---

# The story detail shows each UAT test's proven verdict distinct from its lower-rigor vouch

**Outcome —** The story detail (panel + CLI) shows each UAT test as two distinct marks — a PROVEN
verdict (the real signed gate state that can green the story) and a lower-rigor VOUCH (never green) —
alongside the witness kind that gates who may prove it.

## Guidance

Per [ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)
the detail surface carries a TWO-TIER model per test — a real proof AND a lower-rigor vouch — not the
single "attestation mark" the ADR-0044-era draft described (ADR-0082 supersedes-in-part ADR-0044
§2/§3: a human stamp on a declared-human test is now a real proof, no longer only a never-green
signal):

- **PROVEN verdict (✓/✗/–).** The SIGNED verdict in `events.verdict`, earned by the test's declared
  witness: a `machine` test by its machine proof (the gate), a `human` test by an `operator-attested`
  verdict signed by a real person, `either` by whichever is produced. This IS the gate-green state —
  and the story's OWN UAT crown greens from the AND-roll-up of these per-test verdicts
  (`rollupStoryUat`, ADR-0082 d.3). For a `human`/`either` test not yet proven, the ✓ is a clickable
  "I saw it work" control that signs the operator-attested verdict (the in-UI signature ADR-0044 §4
  deferred, now a real green path); the server stamps the signer from the verified identity and
  REFUSES a machine-witness test — a click is not a machine proof (the `checkUatProof` sign-time
  guard, ADR-0082 d.2).
- **VOUCH (⚑/⚐ in the panel, ◉/▣ in the CLI).** The lower-rigor `events.attestation` "I also
  eyeballed it" mark, kept intact — filled for a pass vouch, muted otherwise. A vouch is NOT a proof:
  it NEVER greens the crown and never paints the gate-green hue (ADR-0044 d.2/d.3 stand, scoped to the
  vouch). This is the never-green tier the original ADR-0044 framing meant; ADR-0082 splits it from
  the proof above so the two tiers are never conflated.
- Each row also shows the test's witness kind (`human | machine | either`), which gates which marks an
  operator may add — a machine-witness test admits no operator attestation, only its machine proof.
- `storytree uat list <story>` and `storytree tree <story>` carry the same per-test PROVEN column
  (advisory, silently absent offline like the verdict glyphs), plus the story-UAT roll-up line.
- Reuses the world's css classes for the seal/hue so the marks can't drift from the signpost
  vocabulary.

## Contracts (2)

1. **`per-test-marks-distinct`** — proven verdict, vouch, and blank read differently; the vouch is never green
   - **asserts —** a test with a signed pass renders the PROVEN ✓ (the gate-proven green state); a
     test carrying only a vouch renders the lower-rigor vouch mark, which is NOT the gate-green hue;
     an un-attested test is blank. The proof tier and the vouch tier are visually distinct and never
     conflated.
2. **`vouch-stays-in-detail`** — a vouch never moves the island hue; only a signed verdict rolls up
   - **asserts —** recording a lower-rigor vouch changes the panel/CLI detail only — the island's
     status hue is unchanged by any vouch (ADR-0044 d.3 stands for the vouch). A per-test PROVEN
     verdict, by contrast, DOES roll up: signing the last outstanding per-test verdict greens the
     story's own UAT crown (the AND-roll-up `rollupStoryUat`, ADR-0082 d.3) — the intended behaviour,
     not a violation of this contract.
