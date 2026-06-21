---
id: "uat-attestation"
tier: story
title: "UAT attestation — each UAT test earns green by its witness; a vouch never forges a green"
outcome: "A story's UAT is a set of individually-addressable tests, each declaring a witness (human, machine, or either). A test earns a real signed verdict by its witness — a machine proof, or a human's 'I saw it work' operator attestation — and the story's own UAT greens as the AND-roll-up of those per-test verdicts. A separate, lower-rigor vouch ('I also eyeballed it') stays in the detail view, distinct from a gate-proven pass, and never greens the story. No path ever forges a green."
status: proposed
proof_mode: UAT
capabilities: [uat-test-units, attestation-signals, attestation-surface]
depends_on: [studio, library]
decisions: [44, 82]
---

# UAT attestation — each UAT test earns green by its witness; a vouch never forges a green

**Outcome —** A story's UAT is a set of individually-addressable tests, each declaring a witness
(human, machine, or either). A test earns a real signed verdict by its witness — a machine proof, or
a human's "I saw it work" operator attestation — and the story's own UAT greens as the AND-roll-up of
those per-test verdicts. A separate, lower-rigor vouch ("I also eyeballed it") stays in the detail
view, distinct from a gate-proven pass, and never greens the story. No path ever forges a green.

The deciding ADRs are [ADR-0044](../../docs/decisions/0044-per-uat-test-human-attestation.md) — which
refines ADR-0040's story-level human-witness signpost down to the individual UAT test (a story has one
tree but many UAT tests, and "always allow both" human and machine) — and
[ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md),
which **supersedes-in-part ADR-0044 §2/§3**: a human stamp on a declared-human test is now a *real
signed verdict* that greens it (ADR-0007's `operator-attested` mode), not only a never-green signal,
and a story's own UAT greens as the AND-roll-up of its per-test verdicts. The honesty rule is
untouched: green is still a signed verdict, and no one can forge one.

## Design floor (ADR-0044, reconciled by ADR-0082)

- **Granularity = the UAT test.** Both a proof and a vouch attach to one test, not the whole story.
- **Both witnesses, first-class.** A test declares `witness: human | machine | either`.
- **Two tiers, never conflated:**
  - A **proof** is a real signed verdict in `events.verdict`, earned by the test's witness — a
    `machine` proof, or a `human`'s `operator-attested` sign-off signed by a real person. It greens
    the test, and the story's own UAT crown greens as the AND-roll-up of its per-test verdicts
    (`rollupStoryUat`, ADR-0082 d.3). A sign-time guard (`checkUatProof`) keeps it honest: a
    machine-witness test can't be greened by a click, and an agent can never self-attest a human
    test — so a green is never forged.
  - A **vouch** is the lower-rigor `events.attestation` "I also eyeballed it" mark (signer, witness,
    note, `relayedBy` when an agent scribed for a human). It lives in a separate log, NEVER in
    `events.verdict`, never paints the gate-green hue, and never rolls up (ADR-0044 d.2/d.3 stand,
    scoped to the vouch).
- **Distinct, in detail.** Per-test marks render in the story panel + CLI — the PROVEN verdict
  (✓/✗/–) distinct from the lower-rigor vouch (⚑/⚐).

## Capabilities (3)

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`uat-test-units`](uat-test-units.md) | A story's UAT steps become stable, addressable test units, each declaring whether a human, a machine, or either can attest it. | proposed | — |
| 2 | [`attestation-signals`](attestation-signals.md) | A per-test attestation persists as an append-only signed signal (human or machine), with relayed-by provenance, separate from gate verdicts and never rolled up. | proposed | `uat-test-units` |
| 3 | [`attestation-surface`](attestation-surface.md) | The story detail (panel + CLI) shows each UAT test's PROVEN verdict (the signed gate state that can green the story) distinct from its lower-rigor vouch (never green). | proposed | `attestation-signals` |

## Story UAT (would-be)

The bold lead is each test's title; the `(witness: …)` tag declares who may attest it (parsed by
`uat-test-units` into `<story>#uat-<n>` ids — absent ⇒ `either`).

1. **Decompose** _(witness: machine)_: a story's UAT prose resolves to addressable test ids with
   witness kinds. **Success —** each test has a stable id and a `witness`.
2. **Human verdict** _(witness: human)_: the owner signs "I saw it work" for a human-witness test
   (in-UI, or via `storytree uat attest`). **Success —** a signed `operator-attested` verdict lands
   in `events.verdict`, signed by a real person; that test reads PROVEN ✓.
3. **Machine** _(witness: machine)_: an automated UAT run proves a `machine` test. **Success —** a
   signed machine verdict for that test id; it reads PROVEN ✓.
4. **Story roll-up** _(witness: machine)_: every per-test verdict for the story passes.
   **Success —** the story's own UAT crown greens as the AND-roll-up (`rollupStoryUat`); a single
   signed `fail` withers it.
5. **Vouch never greens** _(witness: human)_: the owner records a lower-rigor vouch ("I also
   eyeballed it"). **Success —** it lands in `events.attestation` only (signer, `relayedBy` when an
   agent scribed); `events.verdict` is untouched, the island hue is unchanged, and no green is forged.
6. **Distinct display** _(witness: human)_: the panel shows the PROVEN verdict (✓/✗/–) distinct from
   the lower-rigor vouch (⚑/⚐). **Success —** the vouch never reads as a gate-proven pass.

## Resolved modeling calls

- **In-UI human signing** (an admin signs an attestation directly, no agent relay) — RESOLVED by
  ADR-0082: the studio "I saw it work" button (PR #271) and `storytree uat attest` (PR #268) sign an
  `operator-attested` verdict from a verified identity (the in-UI signature ADR-0044 §4 deferred).
- **Per-test green by witness** (whether a per-test signal can become a real gate verdict) — RESOLVED
  by ADR-0082: a declared-human test earns a real `operator-attested` verdict and a machine test a
  machine proof; the story's UAT greens as the AND-roll-up. A vouch remains a vouch (never green).
