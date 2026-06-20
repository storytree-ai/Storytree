---
status: accepted
decided: 2026-06-20
supersedes_in_part: [44]
amends: [40]
---
# ADR-0082: Per-test UAT tests earn green by declared witness; story UAT greens when all pass

## Status

accepted (2026-06-20) — direct owner decision in conversation, recorded the same day. Reconciles the
proof model across three ADRs: it adopts [ADR-0007](0007-proof-model.md)'s `operator-attested` mode
as a *real proof* for human-witnessed work, **supersedes-in-part [ADR-0044](0044-per-uat-test-human-attestation.md)**
§2/§3 (a human stamp is no longer confined to a never-green signal), and **amends
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)** §2 (the story's own UAT
green becomes the AND-roll-up of its per-test UAT verdicts, not a single UAT-node verdict).

## Context

[ADR-0044](0044-per-uat-test-human-attestation.md) decomposed a story's UAT into per-test units, each
declaring a `witness` (`human | machine | either`) — the right granularity, and it is already built
(`@storytree/library`'s `uat-tests.ts`: `UatTest`, `uatTestId`, `parseUatTests`). But it modelled
**all** human input as an *attestation signal*: §2 says a stamp is *"NOT a gate verdict and never
written to `events.verdict`"*, and §3 says *"a fully-human-attested story is not thereby green."*

That rule was scoped to one case — the agent-**relayed** vouch ("I saw it work", the agent scribes it,
`relayedBy`), which §4 itself calls *"deliberately lower-rigor than the in-UI human signature."* For a
relayed vouch, "never green" is correct: hearsay is not a proof. Applied to **all** human input it
over-reaches and contradicts [ADR-0007](0007-proof-model.md)'s third proof mode, `operator-attested`,
which already states a human-granted signed event *"reaches `healthy`."* The consequence is a dead end:
a UAT test *declared* `witness: human` has no machine path **and** cannot be greened by a human either,
so any story with a human-only acceptance test can never be fully green.

The owner's model resolves it: **an agent or a human can stamp an individual UAT test green — depending
on whether that test declares a machine or a human witness — and the island (story) flips green only
when all of its UAT tests are green.**

## Decision

**1. A per-test UAT test earns a *signed verdict* by its declared witness — not a second-class signal.**
`machine` → a machine proof; `human` → an `operator-attested` verdict ([ADR-0007](0007-proof-model.md))
signed by a real human identity; `either` → whichever is produced. The result is a normal
`events.verdict` row, so the invariant *green = a signed verdict* ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)/[ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md))
is **preserved** — the only generalization is that the **signer** of an operator-attested verdict may
be a human.

**2. A write-time trust guard keeps "green" honest (`checkUatProof`).** When a verdict is offered to
prove a test:
- a `human` test's verdict MUST be `operator-attested` AND signed by a **non-agent** identity — never
  a `sandbox:` run identity, never the building agent itself (ADR-0007's *an agent can never
  self-exempt*);
- a `machine` test CANNOT be greened by operator attestation — a human click cannot stand in for a
  machine proof (keeps [ADR-0044](0044-per-uat-test-human-attestation.md) §5's trust calibration: a
  vouch is not a machine proof);
- an `either` test admits both — a machine proof as-is, or an operator attestation that clears the
  human guard.

**3. Story UAT green = the AND-roll-up of its per-test UAT verdicts (`rollupStoryUat`).** A story's own
UAT is `healthy` iff **every** declared per-test UAT unit is `healthy`; a signed `fail` on **any** test
withers it to `unhealthy`; otherwise it abstains (`null`) so the world under-claims, never over-claims.
This **amends [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §2**, which
greened the crown from a single story-UAT-node verdict. The separate *no roll-up from CHILDREN* rule
stands unchanged: six green capability plants still do not make a green crown — only the story's own
UAT (now decomposed into N tests) greens it, when all N pass.

**4. The ADR-0044 attestation survives, narrowed to its honest use.** `events.attestation` and
`deriveAttestations` remain for the lower-rigor signals they were built for: the agent-relayed vouch,
and an "I also eyeballed it" mark on a machine/`either` test. A vouch is still not a proof; what
changes is that a **direct** human signature on a **declared-human** test now *is* a proof.

**5. Sign-time vs read-time split.** The guard (decision 2) enforces legitimacy when a verdict is
*signed* — it belongs on the write surface, mirroring how the prove-it-gate enforces the honesty walls
at sign time. `rollupStoryUat` (decision 3) only *reads* signed verdicts, exactly as `rollupStatus`
does — the rollup never re-judges, it derives.

## Consequences

**Good.**
- A human-only UAT test (a sign-in flow, "does it look right") can finally make its story green —
  honestly, via a signed operator-attested verdict, not a forged machine pass or a chat message that
  evaporates.
- *Green = a signed verdict* is preserved; the human path reuses [ADR-0007](0007-proof-model.md)'s
  existing `operator-attested` mode rather than inventing a parallel green path.
- The honesty wall is strengthened: no self-exempt (a `sandbox:`/agent identity can never sign a
  human-witness test), and a human cannot click-to-green a machine-witness test.

**Bad / scope (what this ADR builds vs leaves as named follow-on).**
- BUILT here: the COMPUTE — `rollupStoryUat` + `checkUatProof` in `@storytree/orchestrator`
  (`proof/uat-proof.ts`), red→green tested offline. The DATA + parser already existed
  (`@storytree/library` `uat-tests.ts`, ADR-0044).
- NOT yet built (named follow-on units): the WRITE surfaces that produce an operator-attested verdict
  — a CLI `uat attest` and a studio admin signature (the in-UI signature [ADR-0044](0044-per-uat-test-human-attestation.md)
  §4 deferred); wiring `rollupStoryUat` into the studio/`story build` status derivation; and the
  per-test rendering ([`stories/uat-attestation/attestation-surface`](../../stories/uat-attestation/attestation-surface.md),
  still `proposed`). Until a surface exists, no per-test verdict is produced, so the roll-up has nothing
  to roll up — the model is correct and tested, not yet live end to end.
- [ADR-0044](0044-per-uat-test-human-attestation.md)'s `events.attestation` family is retained
  (narrowed in meaning), not deleted.

## References

- [ADR-0007](0007-proof-model.md) — the `operator-attested` proof mode this adopts as a real green path.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — *green = a signed gate verdict*, preserved.
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — verdict-derived green (amended §2: per-test AND-roll-up).
- [ADR-0044](0044-per-uat-test-human-attestation.md) — per-test UAT (superseded-in-part §2/§3: a human stamp can now be a proof).
- `packages/library/src/uat-tests.ts` — the per-test UAT data + parser (already built).
- `packages/orchestrator/src/proof/uat-proof.ts` (+ `.test.ts`) — the compute this ADR adds.
