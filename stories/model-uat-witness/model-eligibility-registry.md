---
id: "model-eligibility-registry"
tier: capability
story: model-uat-witness
arc: model-uat-promotion
title: "A criterion's required tier resolves against an explicit versioned registry — substitute up, or hold"
outcome: "A criterion's required model tier resolves against an explicit, versioned registry — a stronger registered judge substitutes upward, an unregistered or self-declared model is ineligible, and a required tier with no available judge holds the criterion rather than downgrading, rerouting, or relabelling it."
status: proposed
proof_mode: integration-test
depends_on: [model-tier-classification]
decisions: [209, 192]
# Node-borne proof config (ADR-0057), now EDIT-EXISTING after the first REAL promotion. AUTHOR_TEST
# adds runtime assertions that the seed pins exactly the admitted Claude SDK ids (`claude-opus-4-8`
# advanced, `claude-fable-5` frontier) and excludes GPT-5.6 Sol; IMPLEMENT corrects model-registry.ts.
# The whole package suite is the regression oracle; no DB, API, SDK call, or live model.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat", "test"]
  scope:
    testGlobs: ["packages/model-uat/src/model-registry.test.ts"]
    sourceGlobs: ["packages/model-uat/src/model-registry.ts"]
  real:
    testFile: "packages/model-uat/src/model-registry.test.ts"
    sourceFile: "packages/model-uat/src/model-registry.ts"
    scope:
      testGlobs: ["packages/model-uat/src/model-registry.test.ts"]
      sourceGlobs: ["packages/model-uat/src/model-registry.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/model-uat", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-uat", "typecheck"]
---

# A criterion's required tier resolves against an explicit versioned registry — substitute up, or hold

**Outcome —** A criterion's required model tier resolves against an explicit, versioned registry — a
stronger registered judge substitutes upward, an unregistered or self-declared model is ineligible,
and a required tier with no available judge HOLDS the criterion rather than downgrading, rerouting, or
relabelling it.

## Guidance

- The pure module at `packages/model-uat/src/model-registry.ts` (the story-owned port, browser-safe
  zod, no `node:`) plus its resolution function: given a criterion's required tier
  (from `model-tier-classification`) and the current registry, returns one of: an ELIGIBLE judge (the
  registered model that satisfies it) or a HOLD.
- **The registry is explicit and versioned** (ADR-0209 D2): a data structure carrying a schema
  version and, per registered model, its CONCRETE runtime id and conferred tier. The repo's live SDK
  convention is `claude-<family>-<version>` (`claude-opus-4-8` in
  `packages/agent/src/headless-orchestrator.ts` / ADR-0132 and `claude-sonnet-5` in
  `sdk-author.ts`), so the owner-directed seed is exactly:
  `claude-opus-4-8` = available `advanced`; `claude-fable-5` = available `frontier`.
  `claude-fable-5-thinking-high` is a Cursor model slug, NOT the Claude SDK runtime id and is barred
  from this registry. Providers/models NEVER self-declare equivalence; an id absent from the registry
  is ineligible. GPT-5.6 Sol remains absent/unavailable until a future admitted subscription runtime.
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

1. **`registry-confers-tier-explicitly`** — the curated seed pins both admitted Claude runtime ids; only a registered entry confers a tier
   - **asserts —** the seed contains exactly the available admitted pair
     `{ id: "claude-opus-4-8", tier: "advanced" }` and
     `{ id: "claude-fable-5", tier: "frontier" }`; it contains neither the Cursor-only
     `claude-fable-5-thinking-high` slug nor an available GPT-5.6 Sol entry. An absent/self-declared id
     resolves INELIGIBLE; only the versioned registry confers tier (ADR-0209 D2).
2. **`stronger-substitutes-for-lower`** — a higher-tier registered judge satisfies a lower requirement
   - **asserts —** a registered `frontier` judge satisfies an `advanced` requirement (substitute
     upward); a registered `advanced` judge does NOT satisfy a `frontier` requirement; anything below
     `advanced` never satisfies any requirement (the floor).
3. **`unavailable-required-tier-holds`** — no available judge yields a distinct HOLD, never a launder
   - **asserts —** a required tier with no available registered judge resolves to a distinct HOLD state
     — NOT downgraded to a lower tier, NOT routed to a lower model, and NOT relabelled `human`
     (ADR-0209 D2/D4); HOLD is distinct from eligible, from green, and from a human witness.
