---
id: "model-judged-uat"
tier: story
title: "An eligible model judge returns structured PASS/FAIL/INCONCLUSIVE — the spine validates, escalates, and signs"
outcome: "An independent fresh read-only model judge returns structured PASS, FAIL, or INCONCLUSIVE for a model-witness criterion; the spine validates shape, eligibility, tier, clean detail-hash anchor, and evidence, then either signs or escalates by the declared ladder — never laundering a FAIL into human green."
status: proposed
proof_mode: UAT
# Every UAT leg below is deterministic and machine-witnessed. Absence defaults the story node to
# human (ADR-0040), which would make `story build --real` withhold it dishonestly.
uat_witness: machine
# Immutable arc provenance (ADR-0183): the THIRD landable increment of the `model-uat-promotion` arc
# (ADR-0209, owner-directed 2026-07-17). Increment 1 (`model-uat-witness`) landed the tiered-witness
# DATA + eligibility foundation. Increment 2 (`uat-criterion-detail`) landed the seed-canonical
# detail artifact + content-hash anchor. THIS story is the JUDGE + SPINE + ESCALATION foundation
# (ADR-0209 D3/D4): independent fresh read-only model judgment, structured PASS/FAIL/INCONCLUSIVE,
# spine validation and signing, and the capability escalation ladder. Studio row concision and the
# three-story pilot migration are LATER arc increments (see "Where this sits in the arc") — authored
# just-in-time as the orchestrator consumes each (slow growth, ADR-0183), NOT scaffolded here.
arc: model-uat-promotion
# Packages-forward ownership (ADR-0192): this NEW story owns a NEW workspace package/port,
# `@storytree/model-judged-uat` (`packages/model-judged-uat`). Every proof-bound source below lives
# in that building. It consumes `@storytree/model-uat` (witness/tier/eligibility) and
# `@storytree/uat-criterion` (detail pointer + content-hash fresh/stale). Orchestrator/drive
# consumer wiring that *invokes* the live Fable judge or persists signed rows is consumer-side glue
# AFTER these proofs — no proof source squats in foreign buildings (ADR-0192).
depends_on: [model-uat-witness, uat-criterion-detail]
# Deciding ADRs (ADR-0037 §2): 0209 (D3/D4 — this story's charter); 0020 (spine observes and signs;
# leaves do not self-certify); 0082 (per-test UAT criteria); 0192 (packages-forward ownership);
# 0010 (organism model + splitting-rule).
decisions: [209, 20, 192, 82, 10]
# Capabilities, roots-first (a capability appears after everything it depends on).
capabilities: [judge-result-shape, independent-judge-seam, spine-judge-validation, model-escalation-ladder]
# Node-borne STORY-UAT proof config (ADR-0057 / ADR-0092). NET-NEW package: AUTHOR_TEST writes the
# standing UAT against the public `@storytree/model-judged-uat` barrel; IMPLEMENT exports the
# result-shape / judge-seam / spine-validation / escalation API. The package suite is the explicit
# proof command and regression wall. No DB, SDK, API, or live model for the leaf proofs; the judge
# seam is proven offline against a scripted read-only impl (live Fable is consumer glue + later
# operator/out-of-band attestation when a criterion actually needs a live frontier run).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-judged-uat", "test"]
  scope:
    testGlobs: ["packages/model-judged-uat/src/model-judged-uat.uat.test.ts"]
    sourceGlobs: ["packages/model-judged-uat/src/index.ts"]
  real:
    testFile: "packages/model-judged-uat/src/model-judged-uat.uat.test.ts"
    sourceFile: "packages/model-judged-uat/src/index.ts"
    scope:
      testGlobs: ["packages/model-judged-uat/src/model-judged-uat.uat.test.ts"]
      sourceGlobs: ["packages/model-judged-uat/src/index.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "typecheck"]
---

# An eligible model judge returns structured PASS/FAIL/INCONCLUSIVE — the spine validates, escalates, and signs

**Outcome —** An independent fresh read-only model judge returns structured PASS, FAIL, or
INCONCLUSIVE for a model-witness criterion; the spine validates shape, eligibility, tier, clean
detail-hash anchor, and evidence, then either signs or escalates by the declared ladder — never
laundering a FAIL into human green.

This is the **JUDGE + SPINE + ESCALATION foundation** of the `model-uat-promotion` arc (ADR-0209
increment 3): it makes model judgment an independent, fresh, read-only run that returns structured
`PASS | FAIL | INCONCLUSIVE` with criterion evidence and rationale (ADR-0209 D3); has the
deterministic spine validate output shape, model eligibility, criterion tier, clean detail-hash
anchor, and evidence bindings before recording a signed verdict (ADR-0209 D3); and escalates by
declared capability without laundering failure — advanced INCONCLUSIVE → frontier, frontier
INCONCLUSIVE → exceptional human, FAIL → build (ADR-0209 D4). The model never writes or signs its
own green.

It stands on increment 1 (`model-uat-witness`: who may judge) and increment 2
(`uat-criterion-detail`: what contract/hash is judged). It deliberately does **not** render Studio
rows or migrate pilot stories — each of those is a later arc increment (see "Where this sits in the
arc").

## The journey (why this is ONE story — the journey-principle)

The consumer is the deterministic spine (and the author who trusts its signed model-UAT rows): its
goal is *"an eligible model judged this criterion honestly, and the spine either signed that
judgment or escalated without laundering failure."* Finishing "I've got a structured judge result"
leads straight to needing "and the spine validated eligibility/tier/hash/evidence" and "and
INCONCLUSIVE/FAIL routed by the ladder rather than a human override" — one continuous
judge→validate→escalate/sign journey (journey-principle). Its proof shares one precondition (a
model-witness criterion with a fresh detail-hash anchor plus an eligible judge) and one observable
(a spine-admitted signable outcome or an honest escalation/hold), so the splitting-rule keeps it
whole.

**Studio row concision (ADR-0209 D7) stays OUT.** Different consumer, different observable.
**Pilot migration (ADR-0209 D8) stays OUT.** Different journey (classify + detail real stories).

## Design floor (from ADR-0209 D3/D4 — do not re-litigate)

- **Independent fresh read-only judge.** The judge runs separately from the builder, with fresh
  context and no write tools. It returns structured `PASS | FAIL | INCONCLUSIVE` with
  criterion-by-criterion evidence references and rationale (ADR-0209 D3).
- **Spine validates and signs; the model never self-greens.** The deterministic spine validates
  output shape, model eligibility, criterion tier, clean anchor, and evidence bindings, then records
  the signed verdict. The model never writes or signs its own green (ADR-0209 D3 / ADR-0020).
- **Escalate without laundering failure.** An `advanced` INCONCLUSIVE escalates to an available
  frontier judge. A frontier INCONCLUSIVE may exceptionally escalate to a human. A FAIL at any
  eligible model tier remains red and returns to implementation or rubric repair; a human cannot
  override it into green (ADR-0209 D4).
- **One eligible judge per tier is enough.** Fable and any future peer frontier model do not both
  have to agree unless a later criterion introduces a stronger risk policy (ADR-0209 D4).
- **Fable is the live frontier today; GPT-5.6 Sol is future-only.** Eligibility is already decided
  by `@storytree/model-uat`'s registry (increment 1). This story consumes that resolution; it does
  not reopen the allowlist. Live Fable invocation is consumer glue after the offline port is green.
- **Verdicts anchor to detail hash.** The signable model-UAT payload records the detail content
  hash from `@storytree/uat-criterion`; a stale hash is refused, not signed (ADR-0209 D6).

## Scope boundary — what this story does NOT do (later arc increments)

Held out deliberately (each is its own journey — splitting-rule trigger 1 — authored just-in-time,
not scaffolded here):

- **`uat-detail-studio`** — Studio one-liner row concision + open-Library-detail (ADR-0209 D7).
- **`model-uat-pilot`** — classifying and detailing the three pilot stories (ADR-0209 D8).
- **Reopening `model-uat-witness` / `uat-criterion-detail`** — witness/tier/registry and
  detail/pointer/hash stay as landed; this story consumes them through their public ports.
- **Foreign-building squats** — wiring the live Claude Agent SDK Fable judge into drive/orchestrator,
  persisting signed model-UAT rows into the work/verdict store, extending `proof-protocol`'s binary
  `Outcome` / `UatWitness` enums, and the deferred inc-2 Library KIND_SPECS / CLI sync / agent fence
  injection are **consumer-side glue** after this port's proofs land. Flagged in Ownership below;
  not proof-bound sourceFiles here.

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on). Each is a **LEAF** — an
isolatable backend red→green in TypeScript under the story-owned `packages/model-judged-uat`, armed
for `node build --real` (the orchestrator drives it through the prove-it gate). Result shape,
validation, and escalation are pure offline; the judge seam is offline against a scripted read-only
impl (no live SDK in leaf proofs).

| # | capability | class | outcome | depends on |
|---|---|---|---|---|
| 1 | [`judge-result-shape`](judge-result-shape.md) | LEAF | A model-judge result validates as structured PASS, FAIL, or INCONCLUSIVE with per-criterion evidence refs and rationale — and refuses a malformed or self-signing payload. | — |
| 2 | [`independent-judge-seam`](independent-judge-seam.md) | LEAF | A judge port runs separately from the builder as a fresh read-only call that returns only a structured result; a scripted impl proves the seam offline with no write surface. | `judge-result-shape` |
| 3 | [`spine-judge-validation`](spine-judge-validation.md) | LEAF | The spine admits a result only when shape, registered eligibility, criterion tier, fresh detail-hash anchor, and evidence bindings all hold — and builds a signable model-UAT payload the model itself cannot sign. | `judge-result-shape` |
| 4 | [`model-escalation-ladder`](model-escalation-ladder.md) | LEAF | Structured outcomes route by the locked ladder: FAIL → build; advanced INCONCLUSIVE → frontier; frontier INCONCLUSIVE → human exception; PASS → signable — never laundering FAIL into human green. | `judge-result-shape` |

## Within-story dependency graph

Authored from the intended data-flow (re-derive from the real imports/calls when built, ADR-0010 §3).
The graph is acyclic; `judge-result-shape` is the root.

- `independent-judge-seam` → `judge-result-shape` — the seam's only return type is the structured
  result schema.
- `spine-judge-validation` → `judge-result-shape` — validation and the signable payload are built
  from a parsed structured result plus eligibility/tier/hash inputs from upstream ports.
- `model-escalation-ladder` → `judge-result-shape` — escalation classifies a structured outcome
  (and the criterion's required tier) into the next honest action.

## Ownership and future consumption (ADR-0192 packages-forward)

This NEW story owns the NEW `@storytree/model-judged-uat` port at `packages/model-judged-uat`; every
`proof.real.sourceFile` and literal `sourceGlobs` entry is under that one building. Package scaffold
+ `repo-manifest.json` `packageOwnership` registration must land before the leaf chain (same bootstrap
as `model-uat-witness` / `uat-criterion-detail`).

Runtime dependencies (honest `depends_on`):

- **`model-uat-witness`** (`@storytree/model-uat`) — classified witness, required tier, and
  eligibility registry resolution already proven; spine validation and escalation consume
  `resolveJudge` / HOLD without reopening the allowlist.
- **`uat-criterion-detail`** (`@storytree/uat-criterion`) — detail pointer + content-hash
  fresh/stale classifier already proven; spine validation refuses a stale anchor.

**Deferred consumer glue (NOT this story's proof sources):**

- `@storytree/orchestrator` / `@storytree/drive` invoke the live Fable judge behind the judge seam
  and persist spine-signed model-UAT verdicts.
- `@storytree/proof-protocol` may later widen published verdict vocabulary if signed model-UAT rows
  need a first-class `inconclusive` / `model` witness on the wire — a separate, additive protocol
  change, not a squat in this port's leaf proofs.
- Deferred increment-2 glue (Library `KIND_SPECS`, CLI sync, `runSpawnStoryAuthor` fence injection)
  remains scheduled when landing honesty needs those surfaces — still not this story.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the foundation end-to-end against the real public
`@storytree/model-judged-uat` barrel. Minimal-first (one coherent judge→validate→escalate/sign
journey), defect-driven thereafter. Every leg is **`(witness: machine)`** — deterministic, offline,
spine-observable code (scripted judge; no live model in these legs).

**Goal —** An eligible scripted judge returns structured PASS/FAIL/INCONCLUSIVE for a model-witness
criterion whose detail hash is fresh; the spine admits only honest payloads and escalates by the
locked ladder; every malformed result, ineligible judge, stale hash, and FAIL→human laundering
attempt is refused.

1. **The judge-result shape validates through the public port.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Import the structured result schema and constructors from the `@storytree/model-judged-uat` ROOT barrel. Author well-formed PASS, FAIL, and INCONCLUSIVE results (each with evidence refs + rationale) and one malformed / self-signing payload. **Success —** the three outcomes round-trip; malformed and self-signing payloads are refused at the schema boundary; the public barrel exports the result API (an empty barrel fails this leg).
2. **The judge seam is independent, fresh, and read-only.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Drive the judge port with a scripted read-only impl that returns a structured result for a criterion+detail context. **Success —** the seam returns only a structured result; it exposes no write tool surface; a second call with fresh context does not reuse builder/session mutable state (independence observable in the seam contract).
3. **The spine admits only eligible, hash-fresh, well-shaped results.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Present (a) an eligible advanced/frontier judge + fresh detail hash + well-shaped PASS, and (b) each refusal case: bad shape, ineligible/unregistered judge, tier HOLD, stale detail hash, missing evidence. **Success —** (a) yields a spine-admitted signable model-UAT payload that records judge id, tier, detail hash, and structured outcome; (b) every refusal case is rejected — never signed (ADR-0209 D3/D6).
4. **Escalation follows the locked ladder.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Feed PASS, FAIL, advanced INCONCLUSIVE, and frontier INCONCLUSIVE into the escalation classifier (with an available frontier judge for the advanced case). **Success —** PASS → sign; FAIL → build (not human); advanced INCONCLUSIVE → frontier; frontier INCONCLUSIVE → human exception (ADR-0209 D4).
5. **A FAIL cannot be laundered into human green.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Attempt to route a model FAIL through a human-override / exceptional-human path. **Success —** the ladder refuses; FAIL remains build-bound red; no signable human-green payload is produced from a model FAIL (ADR-0209 D4).
6. **Offline scripted end-to-end matches the public contract.** _(witness: machine)_ _(proof-gate: model-judged-uat#gate-1)_ Run one criterion through scripted judge → spine validation → escalation using `@storytree/model-uat` eligibility and `@storytree/uat-criterion` hash freshness. **Success —** the same structured outcome, admission/refusal, and next-action are observable without a live SDK or DB — the CI/offline reproducibility prior increments established.

End state — a model-witness criterion can be judged by an independent read-only eligible model, validated and signed by the spine, or escalated honestly; every self-green, ineligible judge, stale-hash, and FAIL-laundering path is refused.

## Reliability Gates

The story's six UAT criteria are deterministic package behaviour and bind explicitly to ONE real,
command-bearing observe gate (ADR-0082/0085/0106). The gate does not forge per-test rows: during
Adopt, the spine runs the declared command at a clean committed HEAD, validates every exact
`proof-gate` binding first (no fallback / no partial signing), and then mints one `adopted` verdict per
criterion only when the command is green.

1. **The public model-judged-uat port suite is green** _(gate: observe)_ `pnpm --filter @storytree/model-judged-uat test`.
   The spine observes the real package suite: result-shape schema, independent read-only judge seam,
   spine validation + signable payload, escalation ladder, FAIL-laundering refusal, and offline
   scripted end-to-end. It then signs `model-judged-uat#gate-1`; all six machine criteria above bind
   to this exact command-bearing gate.

Run from a clean committed rebuilt HEAD:
`pnpm storytree adopt model-judged-uat --signer <email> --pg`. Because the story is `proposed`,
Adopt may be rerun (ADR-0097); it observes the package command once, signs the gate, then signs
`model-judged-uat#uat-1` through `#uat-6` against their exact binding. No criterion is switched
human, and no signed row is authored by hand.

## Proof

The story carries the UAT above (ADR-0010 §2). Package scaffold + ownership registration land first;
then the four leaf capabilities chain roots-first through `node build --real`; then the story UAT +
Adopt observe the public barrel. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts;
the authored status stays `proposed`. The whole-story UAT remains explicitly `uat_witness: machine`.

## Where this sits in the arc — the dependency order for the planner

The `model-uat-promotion` arc (ADR-0209) is a multi-increment epic; this story is increment 3. Honest
build order:

1. **`model-uat-witness`** (landed) — tiered-witness DATA + eligibility foundation.
2. **`uat-criterion-detail`** (landed) — seed-canonical detail kind, pointer, hash anchor,
   story-author authority.
3. **`model-judged-uat`** (THIS story) — independent model judge + spine validation/signing +
   escalation ladder. Offline LEAF proofs in `packages/model-judged-uat`; then consumer glue into
   orchestrator/drive for live Fable.
4. **`uat-detail-studio`** (later) — Studio row concision (ADR-0209 D7); depends on 2.
5. **`model-uat-pilot`** (later) — three-story pilot migration (ADR-0209 D8); depends on 1 + 2 + 3
   (+ 4).
