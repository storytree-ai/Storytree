---
status: accepted
decided: 2026-06-14
amends: [40]
---

# ADR-0044: Per-UAT-test human attestation — the owner's "I saw it work" as signal

## Status

accepted (2026-06-14) — owner decision on how human observation feeds the proof model. **Amends
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)**: ADR-0040 put a single
human-witness signpost at the *story* level (blank → sealed once a UAT verdict is signed); this
refines that to the **individual UAT test**, because a story has one tree but many UAT tests, and
some tests need a human while others a machine can prove. The green-is-a-signed-gate-verdict rule
(ADR-0040/ADR-0020) is untouched.

**Superseded in part by [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)
(2026-06-20):** decisions §2/§3 — that a human stamp is only ever a never-green `events.attestation`
signal that does not roll up — are overtaken. A test *declared* `witness: human` now earns a real
`operator-attested` signed verdict (ADR-0007) that greens it, and a story's own UAT greens as the
AND-roll-up of its per-test verdicts. The attestation signal survives, narrowed to the lower-rigor
relayed vouch (§4) and "I also eyeballed it" marks; §1/§4/§5 and the green-is-a-signed-verdict rule
stand.

## Date

2026-06-14

## Context

The owner's vision: *"if I see something working and I tell you, you feed that as signal into the
system — I don't expect it to turn the whole story green, just flag the specific UAT tests."* Some
UAT steps genuinely can't be proven reliably by an agent (a human must look); others can be
machine-checked (the Playwright UAT shadow already does this). Today there is no unit finer than
the story/capability to attach such a signal to, and ADR-0040's signpost is story-grained.

## Owner decisions (2026-06-14)

1. **Granularity is the UAT test, not the story.** "UAT is across many tests though, and we only
   have one tree per story, so this flag is per UAT test, not at the whole-story level." An
   attestation flags one test; it never rolls up to green the island.
2. **Always allow both kinds.** Each UAT test can be satisfied by a human attestation or a machine
   run; some are human-only. Both are first-class.

## Decision

1. **UAT decomposes into identified tests.** A story's UAT steps become individually-addressable
   test units (`<story>#uat-<n>` or a `uatTests` list with stable ids + titles), each declaring a
   `witness: 'human' | 'machine' | 'either'`. This formalises the "Story UAT (would-be)" prose
   already in the story files.
2. **Attestation is a signed signal per test id.** Append-only `events.attestation` (house
   event pattern), keyed by **test id**, carrying `{ outcome, witness: 'human'|'machine', signer,
   at, note }` plus, for relayed human attestations, `relayedBy`. It is NOT a gate verdict and
   never written to `events.verdict`: a person vouching and the gate proving are different claims
   (the whole point of the signed-verdict system), so they live in different logs.
3. **No story roll-up.** Per-test attestations accumulate on the tests; they do not derive a
   story-level hue. The world stays story-grained (ADR-0040) and a fully-human-attested story is
   not thereby "green" — the owner explicitly does not want that conflation.
4. **The human path: observe → tell the agent → signed signal.** When the owner says "I saw test X
   work," the agent records a human attestation for that test id, `signer` = the owner's identity,
   `relayedBy` = the agent — an honest, auditable "the owner vouched, the agent scribed." A later
   capability lets an admin sign directly from the UI (no agent in the loop). The machine path is
   the existing automated UAT run signing a `machine` attestation.
5. **Distinct rendering.** Per-test marks live in the story **detail** surface (panel + CLI),
   where individual tests are listed — human attestations render with ADR-0040's human-witness
   seal vocabulary, machine attestations with a distinct mark, an un-attested test blank. Never the
   same hue as a gate-proven red-green pass, so trust stays calibrated.

## Consequences

- A new `events.attestation` family + a UAT-test model in the schema; the story detail panel and
  `storytree tree` grow a per-test attestation column; the world island is unchanged.
- The owner can finally move the needle on human-only UAT (sign-in flows, "does it look right")
  without forging a gate verdict — the demo's "I clicked it and it worked" becomes durable,
  attributed signal instead of a chat message that evaporates.
- ADR-0040's story-level signpost remains valid as the *story's own UAT-node* witness; this ADR
  adds the finer test grain beneath it. The two coexist: the signpost answers "was the story's UAT
  witnessed," the per-test marks answer "which specific checks have a human or machine behind them."
- Relayed-by-agent attestation is deliberately lower-rigor than the in-UI human signature (a future
  capability) and far lower than a gate verdict; the `witness`/`relayedBy`/`signer` fields keep
  that provenance explicit so no one mistakes a vouch for a proof.
