---
id: "model-eligibility-registry"
tier: capability
story: model-uat-witness
title: "A criterion's required tier resolves against an explicit versioned registry — substitute up, or hold"
outcome: "A criterion's required model tier resolves against an explicit, versioned registry — a stronger registered judge substitutes upward, an unregistered or self-declared model is ineligible, and a required tier with no available judge holds the criterion rather than downgrading, rerouting, or relabelling it."
status: proposed
proof_mode: integration-test
depends_on: [model-tier-classification]
decisions: [209]
---

# A criterion's required tier resolves against an explicit versioned registry — substitute up, or hold

**Outcome —** A criterion's required model tier resolves against an explicit, versioned registry — a
stronger registered judge substitutes upward, an unregistered or self-declared model is ineligible,
and a required tier with no available judge HOLDS the criterion rather than downgrading, rerouting, or
relabelling it.

## Guidance

- A NET-NEW pure module (recommend `packages/library/src/model-registry.ts`, root-barrel /
  browser-safe zod, no `node:`) plus a resolution function that, given a criterion's required tier
  (from `model-tier-classification`) and the current registry, returns one of: an ELIGIBLE judge (the
  registered model that satisfies it) or a HOLD.
- **The registry is explicit and versioned** (ADR-0209 D2): a data structure carrying a schema
  version and, per registered model, its id and conferred tier. `advanced` = a registered Opus-class
  or approved-equivalent judge; `frontier` = Fable today. Providers/models NEVER self-declare
  equivalence — only a registered entry confers a tier; an id absent from the registry is ineligible.
  Seed the registry with today's reality (ADR-0209 Context): the live runtime is the Claude Agent SDK
  on subscription; **Fable is the only admitted `frontier` judge**; GPT-5.6 Sol is NOT admitted (a
  future-only candidate after a separate subscription-funded OpenAI runtime is admitted — leave it out
  of the seed, or mark it explicitly unavailable, never eligible-by-aspiration).
- **Substitute upward only** (ADR-0209 D2): a required tier is satisfied by a registered judge of that
  tier OR STRONGER — a `frontier` judge satisfies an `advanced` requirement; an `advanced` judge NEVER
  satisfies a `frontier` requirement. This is where the `advanced < frontier` ordering (from
  `model-tier-classification`'s enum) is compared.
- **Unavailable HOLDS — never launders** (ADR-0209 D2/D4): if no registered, available judge meets the
  required tier, the criterion resolves to a distinct HOLD state — NOT downgraded to a lower tier, NOT
  routed to a lower model, NOT relabelled `human`. HOLD is its own resolution outcome, distinct from
  eligible, from a green verdict, and from a human witness (a human witness is only ever an
  author-declared `human` criterion, ADR-0209 D4 — never a fallback for an unavailable model).
- **Availability is a registry input, not an inference** — model an available-vs-registered-but-down
  distinction so an admitted-but-currently-unavailable frontier judge still HOLDS rather than silently
  falling back (ADR-0209 D2 "an unavailable required tier holds").
- Pure resolution, no I/O: the registry is data, the resolver is a function. Its red→green pair is
  `model-registry.test.ts`; test-author ≠ code-author. The ESCALATION ladder that consumes a HOLD or
  an INCONCLUSIVE (advanced → frontier → exceptional human) is the LATER `model-judged-uat` increment,
  NOT this capability — this capability decides eligibility and HOLD; the judge run acts on it.

## Contracts (3)

1. **`registry-confers-tier-explicitly`** — only a registered entry confers a tier; no self-declaration
   - **asserts —** a model id present in the versioned registry resolves to its conferred tier; a model
     id ABSENT from the registry (or one merely "claiming" a tier) resolves to INELIGIBLE — a model
     never self-declares equivalence (ADR-0209 D2).
2. **`stronger-substitutes-for-lower`** — a higher-tier registered judge satisfies a lower requirement
   - **asserts —** a registered `frontier` judge satisfies an `advanced` requirement (substitute
     upward); a registered `advanced` judge does NOT satisfy a `frontier` requirement; anything below
     `advanced` never satisfies any requirement (the floor).
3. **`unavailable-required-tier-holds`** — no available judge yields a distinct HOLD, never a launder
   - **asserts —** a required tier with no available registered judge resolves to a distinct HOLD state
     — NOT downgraded to a lower tier, NOT routed to a lower model, and NOT relabelled `human`
     (ADR-0209 D2/D4); HOLD is distinct from eligible, from green, and from a human witness.
