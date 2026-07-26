---
id: "runtime-proof-binding-projection"
tier: capability
story: proof-binding-integrity
title: "Project machine-leg proof-binding outcomes in the runtime"
outcome: "The runtime presents each inspected machine UAT leg's literal observe-gate chain or its explicit refusal without presenting either as a verdict."
status: proposed
proof_mode: integration-test
depends_on: [proof-binding-outcome-contract]
decisions: [180, 249]
---

# Project machine-leg proof-binding outcomes in the runtime

**Outcome —** The runtime presents each inspected machine UAT leg's literal observe-gate chain or its
explicit refusal without presenting either as a verdict.

> **Held successor lane — do not start yet.** The active UI source repair owned by the
> `website-experience` work must land first. After that landing, this is the explicit runtime pickup
> in `C:\code\storytree-runtime`. Until then no agent edits that runtime, duplicates the UI repair, or
> guesses its component/API seam.

## Proof walkthrough (written first)

Given one `evidence` and one `refused` outcome conforming to the landed contract:

1. inspect the valid machine leg and observe the exact gate id, `observe` label, literal command, and
   adoption invocation;
2. inspect the refused machine leg and observe its stated reason and any declared id, with no command
   affordance; and
3. verify neither view says `healthy`, `passed`, or otherwise substitutes presentation for a signed
   proof verdict.

The single observable is the expanded machine-leg proof-binding panel/state.

## Contracts (1)

1. **`renders-evidence-without-laundering-refusal`** — runtime rendering is a total projection of the
   evidence-or-refusal contract.
   - **asserts —** evidence displays only contract-provided literal fields; refusal displays a reason
     and no runnable action; no branch renders a verdict or dispatches a command.
   - **proven by —** integration fixtures for both discriminant branches after the UI repair lands.

## Fence

This capability may display a declared command and adoption invocation, but it must **not execute**
either. The matching fence is co-located: execution and verdict signing remain the drive's deliberate
gate path, never a runtime presentation affordance.

## Handoff condition

At pickup, the runtime successor first verifies that the active UI source repair is landed, then reads
the actual post-repair component/API boundary and chooses the literal test/source pair. A changed
post-repair seam is expected; this authored boundary intentionally forbids pre-landing speculation.
