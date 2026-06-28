---
status: proposed
---
# ADR-0129: Inner-loop adoption target — ratio and goal (open question)

## Status

proposed — opened 2026-06-28 from the inner-loop-adoption investigation
([`docs/research/inner-loop-adoption-gap.md`](../research/inner-loop-adoption-gap.md)) that
[ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) §4 named. This ADR
does **not** decide; it frames the owner fork the evidence surfaces and parks it for ratification. The
build lever it points at — [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md)
Phase 3 — is already accepted and needs no new decision; what is open is **how far to push the ratio,
and to what end.**

## Context

Over Jun 6–27 2026, **23 of 309 source-changing PRs (7.4%) were driven** through `node build --real` /
`story build --real` to a signed verdict; **92.6% bypassed** the inner loop and landed by `pnpm gate` +
merge (the `events` store independently confirms: 79 building events, 72 passing verdicts, 8 of 18
active days with zero driving). The investigation answered *why* and separated two layered facts:

1. **Adoption (actionable).** ~17% of bypass PRs (~50) were a clean single-package logic/server unit
   **inside today's envelope** and were skipped anyway — pure friction (driving is a manual CLI step;
   `--real` is SDK-bounded and slow, `pnpm gate` is free and instant; CI re-proves green regardless).
2. **Shape (structural).** ~83% are not one isolatable red→green leaf — cross-package moves, two-stage
   operator-attested UI, or code fused with the ADR/CLAUDE.md/corpus/infra the loop cannot touch. A
   docs/ADR/corpus tail (~142 non-source PRs) has **no proof mode at all** ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
   E, authoring-as-proof, is unbuilt).

The leading hypothesis — *the outer loop is not yet wired into the studio* — is **confirmed**: ADR-0108's
chat orchestrator is mounted **read/propose only**; **Phase 3 (drive authority) is unbuilt**, so there is
no path from a proposed unit to a signed build. That is the keystone lever and it is already sanctioned.

What is **not** settled is the target. ADR-0128 §4 explicitly allowed that *the current ratio may be
acceptable for non-leaf work.* Building Phase 3 has a cost, and the honest ceiling it can reach is
**bounded** — roughly the ~50 clean units plus the drivable code-cores of the ~218 mixed PRs, **not**
100%, with the docs/ADR/corpus tail out until ADR-0057 E. So the owner-level questions are real:

- **OQ1 — What is the goal?** Is driving valued for **observability** (a livelier forest world, ADR-0048)
  or for **proof-integrity / dogfooding** (ADR-0057's "inner loop for everything")? The two imply
  different targets and different stopping points.
- **OQ2 — What ratio is "enough"?** Is the target "drive every clean leaf" (~the 50), "drive every unit
  with a drivable core" (decompose the mixed PRs too), or "accept the current ratio as honest for a
  codebase whose work is mostly non-leaf"?
- **OQ3 — Does the tail get a proof mode?** Is ADR-0057 E (authoring-as-proof / gate-as-proof for
  docs/ADR/corpus) worth building, or is that work legitimately outside the loop forever?

## Decision

**Open — deferred to the owner.** No ratio, goal, or E-build is chosen here. The evidence (the findings
doc) is the input; this ADR is the durable record of the fork so it is decided deliberately, not by
drift. When the owner rules, this ADR is updated in place to `accepted` with the chosen target (or
superseded by the decision it informs).

What this ADR **does** assert, because the evidence settles it:
- The bottleneck has moved from **capability to adoption** — the envelope (ADR-0057 B/C/D, ADR-0098)
  already reaches the clean units that are being skipped, so "widen the envelope" is **not** the lever.
- The single highest-leverage build is **ADR-0108 Phase 3** (propose → drive bridge), reusing the
  already-built worker (ADR-0090), gate (ADR-0020), and CI-lands-the-trunk (ADR-0022). It is tracked as
  build work, not re-decided here.

## Consequences

- **Good.** The actionable lever (Phase 3) and the genuine fork (the target) are cleanly separated, so
  the build can proceed on owner green-light without waiting on the philosophical question, and the
  ratio target is set with eyes open about the bounded ceiling.
- **Open / cost.** Until OQ1–OQ3 are answered, "raise driving" has no definition of done — a Phase-3
  build could land and the world still be quiet most days (honest, by ADR-0128). Pinning the goal
  prevents over- or under-investing.
- **Numbering.** `0129` was reserved from the store allocator (ADR-0050).

## References

- [`docs/research/inner-loop-adoption-gap.md`](../research/inner-loop-adoption-gap.md) — the evidence:
  PR classification, the events reconciliation, the ADR-0108 phase audit, the friction figures.
- [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) — names this open
  question (§4); the bare map is its honest symptom.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — "inner loop is the
  default"; its staged envelope (E still unbuilt) and gap audit.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the accepted
  chat-driven-orchestration arc; **Phase 3 (drive authority) is the unbuilt keystone lever.**
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the build-only wisp; the observability goal
  (OQ1).
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — the build worker the
  Phase-3 bridge reuses.
