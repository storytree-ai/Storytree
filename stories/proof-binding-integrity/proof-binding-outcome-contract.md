---
id: "proof-binding-outcome-contract"
tier: capability
story: proof-binding-integrity
title: "Machine-leg proof binding resolves to an exhaustive evidence-or-refusal outcome"
outcome: "A typed result represents each machine UAT leg as either its declared runnable observe-gate chain or a concrete refusal, with no inferred third state."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [180, 249]
# ⚠ RE-TIERED `contract` → `capability` on 2026-08-31 (`prove-unproven-capabilities-arc` inc-25,
# FINDING 1). It was authored `tier: contract` / `proof_mode: contract-test` while ALSO being listed
# in [`story.md`](story.md)'s `capabilities:` array and named by TWO capabilities' `depends_on` — so
# `storytree tree proof-binding-integrity` already rendered it as a capability peer and the
# frontmatter disagreed with every consumer of it. Nothing was broken; the tiering was incoherent.
# THE CAPABILITY TIER IS THE TRUE ONE on three independent readings, set out in the body under
# "Why this is a capability, not a contract". Neither the outcome nor the honesty boundary moved.
#
# THE ID KEEPS ITS `-contract` SUFFIX, and that is a decision rather than an oversight: the id is a
# join key held OUTSIDE `stories/**` — `repo-manifest.json` `sourceOwnership` homes
# `packages/library/src/proof-binding-outcome.ts` to it — so renaming it is a cross-fence edit, not a
# spec correction. The suffix now reads as the typed API contract this unit PUBLISHES, which is the
# thing both consumers actually spend, rather than as its tier.
#
# ADOPTION BASIS, spec-borne per ADR-0057 — the same shape its sibling
# [`machine-leg-binding-audit`](machine-leg-binding-audit.md) carries. NO `real:` arm: the module and
# its three-case suite already exist and pass, so there is no red left to observe (ADR-0465). This
# block registers an owner for landed work; it does not manufacture one. `readUnitSourceFiles`
# (`packages/cli/src/check-boundaries.ts`) `continue`s on an absent `real`, so this unit contributes
# nothing to `unitSourceFiles` and the ADR-0192 landlord rule does not fire.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs:
      - "packages/library/src/proof-binding-outcome.test.ts"
    sourceGlobs:
      - "packages/library/src/proof-binding-outcome.ts"
---

# Machine-leg proof binding resolves to an exhaustive evidence-or-refusal outcome

**Outcome —** A typed result represents each machine UAT leg as either its declared runnable observe-
gate chain or a concrete refusal, with no inferred third state.

**Depends on —** nothing within this story. It is the story's root: both
[`machine-leg-binding-audit`](machine-leg-binding-audit.md) and
[`runtime-proof-binding-projection`](runtime-proof-binding-projection.md) consume its result and
neither consumes the other. The story-level edge to `drive-machinery` — the strict resolver whose
eligibility decision this unit preserves — is carried by [`story.md`](story.md)'s own `depends_on`.

## Proof walkthrough (written first)

Given parsed criteria and reliability gates with distinguishable commands:

1. adapt one valid machine resolution and observe the exact full gate id and command argv survive;
2. adapt missing, unknown, non-observe, and commandless cases and observe a distinct refusal reason
   with no command; and
3. attempt to construct an evidence result from any refusal and observe that the contract makes it
   impossible without an eligible resolver result.

The single observable is a discriminated, exhaustive outcome: `evidence` or `refused`.

## Why this is a capability, not a contract

Recorded here rather than in a landing note because the file's own frontmatter is the thing a later
reader will check the claim against. The two tiers were weighed on their published definitions
(`storytree library artifact capability` / `… contract`), and three independent readings agree.

1. **A within-story dependency edge is a capability↔capability edge.** The `capability` definition
   states it directly — *"the within-story dependencies are drawn between capabilities"* (ADR-0010).
   Two capabilities name this unit in `depends_on`, and [`story.md`](story.md) declares it the root
   of the story's dependency graph. Swept on 2026-08-31, `stories/**` held ELEVEN `tier: contract`
   files, and this was the ONLY one that was either a `depends_on` target or a member of a story's
   `capabilities:` array — the other ten are neither. Its wiring was never a contract's; the
   frontmatter was the outlier, not the graph.
2. **The proof is integration-shaped, not isolated.** A contract is *"one automated, ISOLATED unit
   test (collaborators stubbed)"*; a capability is proven *"against real in-story collaborators (no
   stubs within the organism)"*. `packages/library/src/proof-binding-outcome.test.ts` imports the
   REAL `resolveWitness` from `witness-resolution.ts` and drives every case through it (its
   `machineResolution` helper) rather than hand-writing a resolution literal. Its `criterion()` and
   `gate()` helpers build INPUT DATA, not stubbed collaborators. So the suite already is what
   `proof_mode: integration-test` names, and `contract-test` mislabelled it.
3. **A contract belongs within exactly ONE capability, and this unit has two consumers that do not
   contain each other.** Demoting it would have forced one of two false statements onto
   `runtime-proof-binding-projection`: that it depends on `machine-leg-binding-audit`, which it does
   not consume, or that it depends on nothing — which drops a real prerequisite, since its own
   walkthrough opens *"Given one `evidence` and one `refused` outcome conforming to the landed
   contract"*. A shared root that two organs spend is an organ, which is what a capability is.

**What did NOT change.** The outcome sentence, the honesty boundary, both consumers' `depends_on`
edges, the story's dependency graph, and the two deleted criteria whose proving node
[`story.md`](story.md) records against this unit. This is a tier correction, not a re-scoping.

## Guidance

**THE ADAPTER PRESERVES; IT NEVER DECIDES.** It accepts the existing strict resolver result and does
not parse annotations, choose a gate, execute a command, sign an observation, or decide green. The
resolver has already made the only eligibility decision there is to make, and this unit's whole value
is that it cannot quietly make a second one. The matching fence is co-located with the affordance:
because `evidence` carries a literal command and a display-only adoption invocation, this unit may
never run either — execution and verdict signing stay on the drive's deliberate gate path.

**THE THIRD STATE IS THE FAILURE MODE.** Every laundering move this story forbids — a first-observe
fallback, title/package/`(covers:)` inference, a synthetic command, an implied adoption — enters as a
third outcome that is neither honest evidence nor a visible refusal. The result type is a
discriminated union of exactly two branches so that such a state has nowhere to live: a refusal
carries no `gateId`, no `proofCommand` and no `adoptionInvocation`, so no reader can render one as a
runnable chain even by mistake.

## Integration test

**Goal —** Given the real resolver shapes, a valid binding preserves the exact declared command while
each invalid binding becomes a non-runnable refusal that cannot be rendered as evidence.

The proof is `packages/library/src/proof-binding-outcome.test.ts` (3 tests, REAL, passing), run by
`pnpm --filter @storytree/library test`. The real in-story collaborator is `resolveWitness`
(`packages/library/src/witness-resolution.ts`): every case is driven through the actual resolver and
its actual `WitnessResolution` shape, so this suite reds if the resolver's eligibility rule or its
refusal vocabulary moves under the adapter. Criteria and reliability gates are supplied as literal
input data — that is the arrangement, not a stub of a collaborator.

**Proof status (honest) — `proposed`.** A real, standing, passing suite; observational, NOT
`healthy`. Storytree's prove-it-gate did not drive this red→green, and there is no current signed
pass, so ADR-0395 keeps the authored baseline at `proposed`.

## Contracts (2)

1. **`evidence-carries-the-resolvers-exact-chain-and-nothing-derived`** — an eligible machine
   resolution becomes the one runnable branch, reproduced rather than reconstructed.
   - **asserts —** given an eligible machine resolution, `proofBindingOutcome` returns
     `outcome: "evidence"` carrying the resolver's exact full gate id, `gateKind: "observe"`, the
     literal declared command, and the adoption invocation derived from that same gate id — never
     argv manufactured from prose, package convention, or declaration order, so a second `observe`
     gate declared FIRST does not win. Only the evidence branch carries an adoption invocation, so a
     reader typed to evidence cannot be handed a refusal.
   - **covers —** `packages/library/src/proof-binding-outcome.ts` — `proofBindingOutcome`'s
     `coverage === "observe"` branch and the `ProofBindingEvidence` shape.
   - **proven by —** `packages/library/src/proof-binding-outcome.test.ts`, *"evidence preserves the
     resolver's exact eligible gate and literal declared command"* and *"only an evidence branch is
     accepted by an evidence-only reader"* (REAL, passing).
2. **`every-refusal-stays-non-runnable-under-its-own-stable-class`** — the other branch is total, and
   inert.
   - **asserts —** each of the resolver's four refusal classes (`missing-binding`, `unknown-gate`,
     `ineligible-gate`, `missing-command`) becomes `outcome: "refused"` carrying that stable reason
     and the declared gate id when the criterion declared one, and carrying no `gateId`, no
     `proofCommand` and no `adoptionInvocation` — so `proofBindingOutcome` exposes no state between
     evidence and refusal, and no refusal can be read or rendered as a runnable chain.
   - **covers —** `packages/library/src/proof-binding-outcome.ts` — `proofBindingOutcome`'s refusal
     branch and the `ProofBindingRefusal` shape.
   - **proven by —** `packages/library/src/proof-binding-outcome.test.ts`, *"every resolver refusal
     remains non-runnable with its stable class"* (REAL, passing).

## Implementation boundary

**LANDED — this unit no longer names a seam, it names files.** The source/test pair is
`packages/library/src/proof-binding-outcome.{ts,test.ts}`, beside the resolver it adapts, and
`repo-manifest.json` `sourceOwnership` homes the module here. *(Superseding the authored-time note
that said the literal pair "belongs beside the existing library resolver" and that this unit
"deliberately names the seam, not a premature file edit": both were true when written and neither
survived the landing.)*

What stays outside: the strict resolver's eligibility rule (`drive-machinery`'s delivered outcome,
consumed and never revised here), the corpus population question (owned by
[`machine-leg-binding-audit`](machine-leg-binding-audit.md)), and the presentation of an outcome
(owned by [`runtime-proof-binding-projection`](runtime-proof-binding-projection.md), whose lane is
held until the active UI source repair lands).
