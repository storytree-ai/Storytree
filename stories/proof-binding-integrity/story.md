---
id: "proof-binding-integrity"
tier: story
title: "Proof-binding integrity — every machine UAT leg is evidence or a visible refusal"
outcome: "A reader inspecting any real machine UAT leg receives its exact runnable observe-gate chain, or an explicit refusal explaining why no such evidence exists."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: verification-integrity-arc
# This story consumes the delivered strict parser/resolver outcome: a machine leg has exactly its
# declared command-bearing observe gate, or a refusal. It does not revise that rule, create gates,
# or turn an existing unbound claim into evidence.
depends_on: [drive-machinery]
decisions: [180, 184, 249]
capabilities: [proof-binding-outcome-contract, machine-leg-binding-audit, runtime-proof-binding-projection]
---

# Proof-binding integrity — every machine UAT leg is evidence or a visible refusal

**Outcome —** A reader inspecting any real machine UAT leg receives its exact runnable observe-gate
chain, or an explicit refusal explaining why no such evidence exists.

This is the visible, corpus-wide remediation in the `verification-integrity-arc`. It consumes
`drive-machinery`'s established per-leg rule: a machine criterion resolves only through its declared,
command-bearing `observe` gate; absent, unknown, non-observe, or commandless bindings refuse. The
remediation makes that result inspectable without changing its meaning. A refusal remains a refusal —
it is neither a green claim nor a prompt to invent a convenient gate.

## The journey

The consumer is an operator or agent deciding whether a machine UAT claim has runnable evidence. They
open a machine leg and need one answer: **what exact observe gate can I run, or why can I not rely on
this claim?** Completing a formatter but not the corpus audit leaves the consumer unable to find every
claim; completing an audit but not the runtime projection leaves the answer trapped in implementation
data. The journey therefore shares one precondition (a parsed machine criterion plus declared
reliability gates) and one observable (an evidence chain or a refusal at the inspected leg), so it is
one story.

## Honesty boundary

- An **evidence chain** contains the exact full gate id, confirms `gate: observe`, preserves the gate's
  command argv without reconstruction, and gives the corresponding `storytree gate run <story>#gate-<n>
  --pg` adoption invocation. The command is displayed as declared; this story never executes or signs it.
- A **refusal** carries the resolver's concrete class: missing annotation, unknown gate, non-observe
  gate, or observe gate without a command. It names the declared id when one exists.
- The audit covers criteria explicitly classified `witness: machine` only. Human or undecided criteria
  are outside this evidence surface; they are not downgraded, upgraded, or silently folded into the
  machine list.
- A deliberately unproved claim is rendered as an explicit refusal. There is no first-observe fallback,
  title/package/`(covers:)` inference, synthetic command, or implied adoption. Those moves would
  launder a claim into proof and are forbidden by ADR-0180 decision 5 and ADR-0097's rubber-stamp bar.

## Capabilities (3)

The two consumers are deliberately separable after the shared contract: the audit can be driven against
disk-canonical corpus fixtures while the runtime projection is prepared against typed evidence/refusal
fixtures. Story integration connects them only when both are present and the active UI source repair has
landed.

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`proof-binding-outcome-contract`](proof-binding-outcome-contract.md) | A typed, exhaustive evidence-or-refusal result preserves exact gate identity and argv. | `drive-machinery` outcome |
| 2 | [`machine-leg-binding-audit`](machine-leg-binding-audit.md) | Every parsed machine leg in a corpus scan produces one outcome row; no row is omitted or silently repaired. | `proof-binding-outcome-contract` |
| 3 | [`runtime-proof-binding-projection`](runtime-proof-binding-projection.md) | The runtime exposes the shared outcome beside the machine leg, after the active UI source repair lands. | `proof-binding-outcome-contract` |

## Dependency graph

`proof-binding-outcome-contract` is the root. `machine-leg-binding-audit` and
`runtime-proof-binding-projection` each consume its exhaustive result and can land in parallel. The
story integration joins their outputs after both land. The graph is acyclic. The story-level edge to
`drive-machinery` is a real prerequisite: without the delivered strict resolver there is no authoritative
distinction between a runnable observe chain and refusal.

## UAT Test Criteria

**Goal —** For every real machine UAT claim a reader can inspect the precise runnable evidence chain,
or see an explicit reason the claim is not evidence.

1. **A valid machine binding exposes its exact chain.** _(witness: machine)_ Given a machine criterion _(criterion-id: uatc_1ea8471e291f248a3cdf4075)_ _(revision-id: uatr1:5b9a15b09b789646)_
   bound to a declared command-bearing observe gate, inspect it. **Success —** it displays that full
   gate id, `observe` kind, literal command argv, and the matching `storytree gate run <full-gate-id>
   --pg` invocation; changing declaration order cannot change the result.
2. **Every invalid machine binding is visibly refused.** _(witness: machine)_ Inspect fixtures for an _(criterion-id: uatc_ca26fd1c2206e2727626070b)_ _(revision-id: uatr1:bd80dae9511cde74)_
   absent annotation, unknown gate, non-observe gate, and commandless observe gate. **Success —** each
   produces one visible refusal carrying its specific reason, no runnable chain, and no inferred
   substitute.
3. **The corpus audit accounts for the whole machine population.** _(witness: machine)_ Scan corpus _(criterion-id: uatc_29e9d8fb7e84054c8abaf53e)_ _(revision-id: uatr1:e3f69e309db986de)_
   fixtures containing valid and invalid machine legs plus non-machine legs. **Success —** the output
   has exactly one outcome per machine leg and none for other witnesses; a refused row remains present.
4. **The runtime keeps evidence and refusal distinct.** _(witness: machine)_ Open a valid and a refused _(criterion-id: uatc_f85178cd919eb5ade194592b)_ _(revision-id: uatr1:4cfe9a386a43c56a)_
   machine leg in the runtime surface. **Success —** the valid leg exposes the literal chain while the
   refused leg exposes only its reason; neither presentation offers a green verdict, executes a command,
   or hides the refusal.

## Bounded successor path

The next implementation lane is intentionally cut at
[`runtime-proof-binding-projection`](runtime-proof-binding-projection.md). It is **held until the active
UI source repair owned by the `website-experience` work is landed**. Only then may a successor pick up
the runtime work in `C:\code\storytree-runtime`, beginning from the typed contract and corpus-audit
result defined here. This story author does not edit that runtime, the active UI repair, existing story
files, or application/package source.

The held runtime lane is not an excuse to defer the honest backend units: capabilities 1–2 are bounded
and independently driveable once their literal source/test homes are selected against the landed
runtime tree. Conversely, no successor may start capability 3 early, duplicate the UI repair, or make
the display claim a gate passed merely because a row can be rendered.

## Out of scope

- Repairing existing machine annotations or minting reliability gates. The audit reports the existing
  truth; the owning story is amended only when an actual defect violates its contract.
- Executing a gate, observing a command, signing a verdict, changing witness labels, or promoting any
  status.
- Human/operator-attested criteria and their judgment-only presentation.
- The active `website-experience` UI source repair and every edit under `C:\code\storytree-runtime`.
