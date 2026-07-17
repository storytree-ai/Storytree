---
id: "model-uat-witness"
tier: story
title: "A classified UAT criterion earns a tiered witness — machine, capability-tiered model, or irreducible human"
outcome: "A newly classified or migrated UAT criterion resolves to deterministic machine, capability-tiered model, or irreducible human while existing untagged criteria remain legacy-unresolved until migration, and a model criterion is admitted only by a registered judge of at least its declared tier."
status: proposed
proof_mode: UAT
# Every UAT leg below is deterministic and machine-witnessed. Absence defaults the story node to
# human (ADR-0040), which would make `story build --real` withhold it dishonestly.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the FIRST landable increment of the `model-uat-promotion` arc
# (ADR-0209, owner-directed 2026-07-17). This story is the DATA + RESOLUTION foundation the rest of the
# arc stands on — the `model` witness kind, its capability tiers, and the eligibility registry that
# decides which judge (if any) may witness a criterion. The independent spine-signed model JUDGE run,
# the seed-canonical per-criterion Library artifact, the Studio row concision, and the three-story pilot
# migration are LATER arc increments (see "Where this sits in the arc" below) — authored just-in-time as
# the orchestrator consumes each (slow growth, ADR-0183), NOT scaffolded here.
arc: model-uat-promotion
# Packages-forward ownership (ADR-0192): this NEW story owns a NEW workspace package/port,
# `@storytree/model-uat` (`packages/model-uat`). Every proof-bound source below lives in that building.
# It imports no other @storytree package in this increment, so the story is a dependency root.
# Existing `@storytree/library` parser consumers are integrated only AFTER these proofs through an
# explicit adapter/re-export + package edge owned by the consuming story; no proof source squats there.
depends_on: []
# Deciding ADRs (ADR-0037 §2): 0209 (add `model` as a distinct capability-tiered witness below
# irreducible human — this story's charter); 0082 (per-test witness earns green — the binary model this
# story extends to three kinds); 0106 (the adopt pass resolves each leg's witness — extended here beyond
# binary); 0055 (the seed-canonical exception ADR-0209 §5 widens — cited for the LATER detail-artifact
# increment, not built here); 0192 (packages-forward ownership); 0010 (the organism model +
# splitting-rule that tiers these units).
decisions: [209, 192, 82, 106, 55, 10]
# Capabilities, roots-first (a capability appears after everything it depends on).
capabilities: [three-kind-witness, model-tier-classification, model-eligibility-registry]
# Node-borne STORY-UAT proof config (ADR-0057 / ADR-0092). Unlike a completeness-only authoring
# proof, this greenfield story has a genuine executable integration red: AUTHOR_TEST writes the
# net-new model-uat-witness.uat.test.ts, which imports a missing net-new model-uat-witness.ts facade;
# IMPLEMENT authors that pure facade to compose the delivered parser/tier and registry capabilities.
# The UAT test drives the six all-machine legs end-to-end over literal criteria/registries — including
# legacy `either` staying unresolved and barred from model judgment — with no DB, SDK, API, or live
# model. It is story-level composition glue, not a fourth capability journey. `install: true` and
# typecheck retain the dependency/type wall for @storytree/model-uat in the shared REAL worktree.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-uat", "test"]
  scope:
    testGlobs: ["packages/model-uat/src/model-uat-witness.uat.test.ts"]
    sourceGlobs: ["packages/model-uat/src/model-uat-witness.ts"]
  real:
    testFile: "packages/model-uat/src/model-uat-witness.uat.test.ts"
    sourceFile: "packages/model-uat/src/model-uat-witness.ts"
    scope:
      testGlobs: ["packages/model-uat/src/model-uat-witness.uat.test.ts"]
      sourceGlobs: ["packages/model-uat/src/model-uat-witness.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-uat", "typecheck"]
---

# A classified UAT criterion earns a tiered witness — machine, capability-tiered model, or irreducible human

**Outcome —** A newly classified or migrated UAT criterion resolves to deterministic machine,
capability-tiered model, or irreducible human while existing untagged criteria remain
legacy-unresolved until migration, and a model criterion is admitted only by a registered judge of
at least its declared tier.

This is the **DATA + RESOLUTION foundation** of the `model-uat-promotion` arc (ADR-0209): it makes
`model` a first-class third witness kind that is *not a subtype or spelling of* `machine` (ADR-0209
D1), gives every model criterion a preclassified minimum capability tier (`advanced` / `frontier`,
ADR-0209 D2), and resolves each model criterion against an explicit, versioned **eligibility
registry** — a stronger registered judge substitutes upward, anything below `advanced` is barred, and
a required tier with no available registered judge **holds** the criterion rather than downgrading it,
routing it to a lower model, or laundering it into a human witness (ADR-0209 D2/D4).

It is deliberately the *smallest honest* first increment: pure, offline-provable classification and
eligibility logic, with **no** model run, **no** Library artifact schema, **no** Studio surface, and
**no** pilot reclassification — each of those is a later arc increment that stands ON this foundation
(see "Where this sits in the arc").

## The journey (why this is ONE story — the journey-principle)

The consumer is a UAT author (and the deterministic spine that later reads their classification): its
goal is to answer, for one criterion, *"who may witness this, and — if a model — is an eligible judge
available?"* Finishing "I've declared this criterion's witness kind" leads the author straight to
needing "and if it's a model, which tier, and is a registered judge of at least that tier available —
or does it hold?" — one continuous classify-then-resolve journey, so it is one story
(journey-principle). Its proof shares one precondition (a parsed criterion) and one observable (the
resolved witness/tier/eligibility decision), so the splitting-rule keeps it whole.

## Design floor (from ADR-0209 — do not re-litigate)

- **Three honest witness kinds.** A criterion resolves to `machine` (deterministic, spine-observed
  proof), `model` (rubric-bound semantic judgment by an eligible read-only model judge), or `human`
  (irreducible operator judgment). `model` is a DISTINCT kind — existing deterministic `machine`
  proofs and their reliability-gate bindings keep their current semantics (ADR-0209 D1).
- **Two model tiers, preclassified.** A model criterion declares `advanced` (a registered Opus-class
  or approved-equivalent judge) or `frontier` (Fable today). A stronger registered judge may
  substitute for a lower tier; anything below the `advanced` allowlist is prohibited from judging UAT
  (ADR-0209 D2).
- **The registry is explicit and versioned.** Providers and models NEVER self-declare equivalence;
  only a registered entry confers a tier (ADR-0209 D2). Fable is the only frontier judge admitted
  today (ADR-0209 Context); GPT-5.6 Sol is a future-only candidate after a separate subscription-funded
  OpenAI runtime is admitted, not by aspiration (ADR-0209 Context/Consequences).
- **An unavailable required tier HOLDS.** No available registered judge for the required tier holds
  the criterion — never a silent downgrade, a route to a lower model, or a relabel to human (ADR-0209
  D2/D4).
- **Legacy-only parse compatibility, never a model default.** Increment 1 preserves `either` only as
  the existing parser's unresolved compatibility state for untagged legacy criteria, so the corpus
  continues to load before the explicitly staged pilot and corpus migration. It may continue the
  current conservative path until that criterion is explicitly migrated, but it can never carry a
  model tier or enter model judgment by default. New and migrated criteria must explicitly classify
  as `machine | model | human`. Retiring the legacy-only `either` parse state belongs to the later
  completed corpus migration, not this increment (ADR-0209 D8).

## Scope boundary — what this story does NOT do (later arc increments)

Held out deliberately (each is its own journey, splitting-rule trigger 1 — the arc outcome cannot be
stated without conjunctions — so each is authored just-in-time as a later increment, not scaffolded
here):

- **The independent model JUDGE run** (ADR-0209 D3/D4) — a separate, fresh, read-only model run
  returning structured `PASS | FAIL | INCONCLUSIVE`, the spine validating shape/eligibility/tier/clean
  anchor/evidence and signing, and the escalation ladder (advanced INCONCLUSIVE → frontier; frontier
  INCONCLUSIVE → exceptional human; FAIL → build). This foundation supplies the tier/eligibility inputs
  that machine consumes; it does not run a judge.
- **The seed-canonical per-criterion Library artifact** (ADR-0209 D5/D6) — a new Library artifact kind
  carrying the detailed action/success/evidence, the story criterion's pointer to it, and the
  artifact-hash anchoring that invalidates stale green. Authoring an actual artifact of that kind is a
  Library-tier write (outside `stories/**`) and needs the kind's schema built first.
- **The Studio row concision** (ADR-0209 D7) — the one-line title + open-Library-detail surface.
- **The three-story pilot migration** (ADR-0209 D8) — classifying `drive-machinery`,
  `library-review`, and `library-tech-tree-overlay` legs and creating their detail artifacts. It
  depends on this foundation, the judge, and the artifact kind all being buildable. Corpus-wide
  migration follows; only its completion may retire legacy-only `either` parsing.

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on). Each is a **LEAF** — an
isolatable backend red→green in pure TypeScript (zod + resolution) under the story-owned
`packages/model-uat`, armed
for `node build --real` (the orchestrator drives it through the prove-it gate; no live service, no DB,
no API key).

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`three-kind-witness`](three-kind-witness.md) | LEAF | A new or migrated criterion explicitly classifies as `machine` / `model` / `human`, while an existing untagged criterion parses only as legacy-unresolved `either` until migration and can never default into model judgment. | — |
| 2 | [`model-tier-classification`](model-tier-classification.md) | LEAF | A `model` criterion declares a minimum capability tier (`advanced` / `frontier`); a non-model criterion carries none, and anything below the `advanced` floor is refused at the parse boundary. | `three-kind-witness` |
| 3 | [`model-eligibility-registry`](model-eligibility-registry.md) | LEAF | A criterion's required tier resolves against an explicit, versioned registry — a stronger registered judge substitutes upward, an unregistered/self-declared model is ineligible, and a required tier with no available judge HOLDS (never downgraded, rerouted, or relabelled human). | `model-tier-classification` |

## Within-story dependency graph

Authored from the intended data-flow (re-derive from the real imports/calls when built, ADR-0010 §3).
The graph is acyclic; `three-kind-witness` is the root.

- `model-tier-classification` → `three-kind-witness` — the tier field is meaningful only on a `model`
  criterion, so tier classification reads the witness kind the root capability establishes; it edits
  the same parser/validator (`uat-test-criteria.ts`) built on the root's committed source.
- `model-eligibility-registry` → `model-tier-classification` — eligibility resolves a criterion's
  *required tier* (the field tier-classification adds) against the registry, so it consumes the tier
  the prior capability establishes.

## Ownership and future consumption (ADR-0192 packages-forward)

This NEW story owns the NEW `@storytree/model-uat` port at `packages/model-uat`; every
`proof.real.sourceFile` and literal `sourceGlobs` entry is under that one building. The port is pure,
browser-safe zod/resolution code with no `@storytree/*` dependency, so `depends_on: []` is honest and
the graph is acyclic.

The existing `packages/library/src/uat-test-criteria.ts` parser remains `library`-owned until
integration. Once this port's proofs land, the planner must schedule explicit consumer-side glue:
`@storytree/library` imports/re-exports or adapts the criterion port (and its story declares the
resulting dependency), then drive consumers move to that boundary. That glue is outside these leaf
proof scopes; this story never claims foreign `packages/library` source. See
`stories/uat-attestation/story.md`'s ADR-0209 reconciliation note: its legacy parser model is
superseded through the new port after integration, while its vouch-vs-proof journey remains untouched.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the foundation end-to-end against the real reshaped
parser + the new tier/registry modules. Minimal-first (one coherent classify-then-resolve journey),
defect-driven thereafter. Every leg is **`(witness: machine)`** — this foundation is itself
deterministic, offline, spine-observable code (the pleasing bootstrap: the machinery that tiers a
model witness is proven by a *machine* witness, ADR-0209 D1 keeping `machine` deterministic).

> **Honest status — `proposed`.** Nothing here is proven through the ceremony; `healthy` is derived
> from signed verdicts, never authored (ADR-0020). This UAT is the TARGET journey the three
> capabilities must pass once built.

**Goal —** An author explicitly classifies one new or migrated UAT criterion's witness and, for a
model, its tier; the machinery resolves an eligible judge or an honest hold while an existing
untagged criterion stays legacy-unresolved, and every route from that legacy state into model
judgment is refused.

1. **Classify the three kinds.** _(witness: machine)_ A criterion tagged `machine`, one tagged
   `model`, and one tagged `human` each parse to their own witness kind. **Success —** `model` is a
   DISTINCT kind, never conflated with `machine`; the three kinds round-trip through the parser +
   validator.
2. **Preserve legacy parsing without defaulting to model.** _(witness: machine)_ An existing
   untagged criterion is presented to the parser before its staged migration. **Success —** it parses
   as legacy-unresolved `either` and continues the current conservative path; it carries no model tier,
   cannot enter model judgment, and remains visibly due for explicit reclassification. A new or
   migrated criterion must explicitly declare `machine`, `model`, or `human` (ADR-0209 D8).
3. **A model criterion declares its tier.** _(witness: machine)_ A `model` criterion tagged
   `advanced` and one tagged `frontier` parse their tiers; a `model` criterion with no tier, and a
   `machine`/`human` criterion carrying a tier, are refused. **Success —** tier ∈ {advanced, frontier}
   is required on and only on a `model` criterion; a below-`advanced` or unknown tier is refused at the
   parse boundary (ADR-0209 D2).
4. **An eligible registered judge witnesses.** _(witness: machine)_ With a registry admitting Fable at
   `frontier` and an Opus-class judge at `advanced`, an `advanced` criterion resolves to an eligible
   judge, and the `frontier` judge SUBSTITUTES upward for an `advanced` requirement. **Success —** the
   required tier is satisfied by a registered judge of that tier or stronger; an `advanced` judge never
   satisfies a `frontier` requirement (ADR-0209 D2).
5. **An unavailable tier HOLDS, honestly.** _(witness: machine)_ A `frontier` criterion is resolved
   against a registry with no available frontier judge. **Success —** it resolves to a distinct HOLD —
   NOT downgraded to `advanced`, NOT routed to a lower model, NOT relabelled `human` (ADR-0209 D2/D4).
6. **No self-declared judge, no unregistered tier.** _(witness: machine)_ A model that is not in the
   registry (or that "claims" a tier) is offered as a judge. **Success —** it resolves to ineligible;
   only an explicit, versioned registry entry confers a tier (ADR-0209 D2).

End state — a new or migrated criterion's witness kind, model tier, and judge eligibility are decided
by explicit deterministic offline rules; an existing untagged criterion remains parseable only as
legacy-unresolved `either`; every dishonest shortcut from that state into model judgment, plus every
below-floor tier, self-declared judge, or laundered downgrade, is refused.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against the
real reshaped parser + the tier/registry modules with the three capabilities' integration tests and
contracts green underneath. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts —
nothing here is authored healthy; the authored `status` stays `proposed`. Because every leg is
`(witness: machine)`, the whole-story UAT is explicitly `uat_witness: machine` (no operator ceremony);
the crown derives from the capabilities' signed `--real` verdicts plus the story UAT's machine legs,
once built.

## Where this sits in the arc — the dependency order for the planner

The `model-uat-promotion` arc (ADR-0209) is a multi-increment epic; this story is increment 1. The
honest build order the orchestrator should hand the planner (each a distinct journey, splitting-rule
trigger 1):

1. **`model-uat-witness`** (THIS story) — the tiered-witness DATA + eligibility foundation. Offline
   LEAF proofs (`node build --real`, pure `packages/model-uat` node:test red→green). It is a root
   port (`depends_on: []`); package scaffold + ownership registration must land before the leaf chain.
2. **`uat-criterion-detail`** (later) — the seed-canonical per-criterion Library artifact kind:
   schema, seed-canonical reconciliation (extending ADR-0055 beyond agents, ADR-0209 D5), the story
   criterion's pointer, and artifact-hash anchoring so a substantive change invalidates stale green
   (ADR-0209 D6). Depends on 1 (the criterion owns witness/tier and points to detail). Mostly offline
   LEAF (schema + sync) with a live seed-canonical reconciliation check.
3. **`model-judged-uat`** (later) — the independent, fresh, read-only model judge run + spine
   validation/signing + escalation ladder (ADR-0209 D3/D4). Depends on 1 (tier/eligibility) and 2
   (verdict anchored to the artifact hash). LEAF for the spine validation/escalation state machine,
   plus a live model-judge leg (operator-attested / out-of-band live run, ADR-0010 §5).
4. **`uat-detail-studio`** (later, may fold into 2) — the Studio row concision: the story-owned
   one-line title, the row opening the Library detail pointer (ADR-0209 D7). Depends on 2. A
   frontend-builder two-stage LOOK (ADR-0070).
5. **`model-uat-pilot`** (later) — the three-story pilot migration: classify each leg of
   `drive-machinery` (deterministic control), `library-review` (mixed knowledge workflow), and
   `library-tech-tree-overlay` (visual frontend) as `machine` / tiered `model` / `human`, create their
   detail artifacts, and explicitly reclassify their untagged legacy legs (ADR-0209 D8). Depends on
   1 + 2 + 3 (+ 4). Corpus-wide migration is a still-later increment informed by this pilot; only
   when that migration is complete does the legacy-only `either` parse state retire.
