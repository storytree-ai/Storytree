---
id: "uat-attestation"
tier: story
title: "UAT attestation — per-test human and machine signals, never a forged green"
outcome: "A story's UAT is a set of individually-addressable tests; each can be attested by a human ('I saw it work', relayed by the agent or signed in the UI) or a machine run; the marks live per-test in the detail view, distinct from a gate-proven pass, and never roll up to green the story."
status: proposed
proof_mode: UAT
capabilities: [uat-test-units, attestation-signals, attestation-surface]
depends_on: [studio, library]
decisions: [44]
---

# UAT attestation — per-test human and machine signals, never a forged green

**Outcome —** A story's UAT is a set of individually-addressable tests; each can be attested by a
human ("I saw it work", relayed by the agent or signed in the UI) or a machine run; the marks live
per-test in the detail view, distinct from a gate-proven pass, and never roll up to green the story.

The deciding ADR is [ADR-0044](../../docs/decisions/0044-per-uat-test-human-attestation.md), which
amends ADR-0040's story-level human-witness signpost down to the individual UAT test — because a
story has one tree but many UAT tests, and "always allow both" human and machine.

## Design floor (from ADR-0044)

- **Granularity = the UAT test.** An attestation flags one test, never the whole story; no roll-up
  to a green island.
- **Both kinds, first-class.** A test declares `witness: human | machine | either`.
- **A vouch is not a proof.** Attestations live in `events.attestation` (signer, witness, note,
  `relayedBy` when an agent scribed for a human), NEVER in `events.verdict`; they never paint the
  gate-green hue.
- **Distinct, in detail.** Per-test marks render in the story panel + CLI — human (the ADR-0040
  seal), machine (a distinct mark), un-attested blank.

## Capabilities (3)

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`uat-test-units`](uat-test-units.md) | A story's UAT steps become stable, addressable test units, each declaring whether a human, a machine, or either can attest it. | proposed | — |
| 2 | [`attestation-signals`](attestation-signals.md) | A per-test attestation persists as an append-only signed signal (human or machine), with relayed-by provenance, separate from gate verdicts and never rolled up. | proposed | `uat-test-units` |
| 3 | [`attestation-surface`](attestation-surface.md) | The story detail (panel + CLI) shows each UAT test's attestation mark, human distinct from machine, never the gate-green hue. | proposed | `attestation-signals` |

## Story UAT (would-be)

1. **Decompose:** a story's UAT prose resolves to addressable test ids with witness kinds.
   **Success —** each test has a stable id and a `witness`.
2. **Human relay:** the owner tells the agent "test 2 works"; the agent records a human
   attestation. **Success —** `events.attestation` holds one signal for that test id, signer = the
   owner, relayedBy = the agent; nothing landed in `events.verdict`.
3. **Machine:** an automated UAT run attests a `machine` test. **Success —** a machine signal for
   that test id.
4. **No roll-up:** all of a story's tests are attested. **Success —** the world island's hue is
   unchanged; the story is not "green" from attestations.
5. **Distinct display:** the panel shows test 2 with the human seal, the machine test with its
   mark, the rest blank. **Success —** neither reads as a gate-proven pass.

## Open modeling calls (for the owner)

- In-UI human signing (an admin signs an attestation directly, no agent relay) is a named
  follow-up; this story lands the relay path first.
- Whether a per-test machine attestation should later be promotable to a real gate verdict is left
  open (it would require the prove-it-gate, not an attestation).
