# Tightening a shared contract needs a full sweep

**Rule:** when a change *tightens* a shared parsing/validation contract — it now **rejects** inputs it previously **accepted** — run the full test suite across every capability that touches that contract, confirmed green, before the story's UAT is signed and before the result is approved onto the trunk. A clean tree and a passing walkthrough are not enough; the tightening can have silently broken fixtures elsewhere.

## Why this matters

Tightening a shared validator (a loader, a deserializer, a schema constraint, a newly-required field) can invalidate test fixtures or seed data *anywhere* that leaned on the old, looser behaviour. Those regressions surface at **runtime** — a fixture fails to parse when its test runs — not at type-check or build time. So the change looks safe: it compiles, the owning capability is green, the UAT walkthrough passes. Meanwhile a sibling capability's fixtures no longer load.

The node rollup and the approval gate read the event store plus on-disk evidence. Neither re-runs the whole suite. So a story can reach `healthy` and be approved onto the trunk with cross-capability fixture regressions completely undetected. The only thing that exercises those sibling fixtures is a full suite run; this rule keys that run to the contract-tightening event so it actually fires at the two irreversible boundaries.

## What counts as tightening a shared contract

The diff changed a shared parsing or validation surface so it now refuses an input shape it formerly accepted. Concretely:

- a hand-written loader or parser made stricter;
- a deserializer that adds a new rejection (e.g. an empty string now rejected where absent and non-empty were the only prior cases);
- a struct that now rejects unknown/extra fields;
- a schema constraint tightened or added (min-length, min-items, a narrowed enum, a new pattern);
- a field that becomes newly required;
- any guard or normaliser that now refuses a shape it formerly accepted.

**Shared** means the surface is consumed beyond the capability that owns it — its fixtures live in other capabilities' tests, in seed corpora, or in event-store test data.

**Not a trigger:** a *loosening* (accept more — a defaulted field, a widened enum, a dropped requirement) cannot invalidate an existing fixture by rejecting it.

## The discriminator

1. Did the change tighten a shared parsing/validation contract — does it now reject an input shape it previously accepted?
   - **No** → this rule does not arm. The usual proof modes stand on their own.
   - **Yes** → continue.
2. Is the full suite green across every capability, not just the owning one?
   - **Yes** → proceed with the UAT sign and the trunk approval.
   - **No** → block. A red sibling suite forfeits the sign and the approval even with a clean tree and a passing walkthrough. Route the broken fixtures back to their owning capability (defects amend the owning story) before re-attempting.

Always sweep the whole workspace, never a single capability — catching *other* capabilities' fixtures is the entire point.

Composes with [test-fixtures-mirror-production-failure-modes](test-fixtures-mirror-production-failure-modes.md): that rule prevents a sterile fixture from ever passing; this one catches a previously-valid fixture that a contract change has just broken. A tightening can break even a well-designed fixture, so the two compose rather than overlap.
