# ADR-0007: The proof model — capability-UAT, contract-test, operator-attested

## Status

proposed

## Date

2026-06-04

## Context

ADR-0002 set the **proof mode** as the boundary between the three work tiers,
and `docs/glossary.md` pinned the one-line definitions. What ADR-0002 settled
was *which tier a unit belongs to*; what it deferred is *how each tier is
actually proven* — the operational discipline a unit goes through to reach
`healthy`. This ADR makes that half: it operationalizes the proof modes,
relocates v1's red-green floor to the right tier, adds the proof mode ADR-0002's
strict trichotomy was missing, and names the convergence test that says a unit
is genuinely rebuildable.

Five v1 (Agentic) decisions carry the substance here, each reshaped to the v2
stack (pi sessions over DBOS, no `claude` binary, no per-agent role cascade):
v1 ADR-0005 (red-green as enforced structure, with red/green evidence *forensic,
not a gate* per its binding 2026-05-18 sub-amendment); v1 ADR-0027 (ADR-0002's
direct precursor — contracts stub/test isolated, UATs integrate, red-green
*relocated to the contract level*); v1 ADR-0008 (the mock/UAT seam — mocks at the
test layer, forbidden in a UAT); v1 ADR-0024 (a real, recurring behavioural class
with *neither* an honest UAT *nor* an isolatable test, promoted only by an
operator-granted attestation); and v1 ADR-0006 (the **cold-rebuild** convergence
contract this ADR keeps as the health invariant).

## Decision

### 1. Each tier's proof mode, operationally

| Tier | Proven by | Isolation | Collaborators |
|---|---|---|---|
| **contract** | one automated **contract test** | isolated | stubbed (the **mock-UAT seam** permits it here) |
| **capability** | ≥1 integrated **UAT** walkthrough + all its contracts green | integrated | **real** — and this is *also* how `dependency` edges are generated (ADR-0002) |
| **story** | composition — its capabilities are proven | — | — |

The capability's UAT runs end-to-end against *real* collaborators, and the same
run that proves the goal is what *generates* the `dependency` edges — wherever
a capability's walkthrough needs another to be real, that other is upstream
(ADR-0002; carried from v1 ADR-0027). The **mock-UAT seam** (glossary) is the
load-bearing boundary: a stub is correct inside a contract test and a structural
defect inside a UAT — a mock that synthesises the observable proves the mock,
not the contract (v1 ADR-0008).

### 2. Red-before-green is a structural discipline at the *contract* level

The **red-green** principle (a failing test authored before the implementation
that turns it green) is relocated from v1's whole-story scope to the
**contract** — the only tier with an automated test to redden (carried from v1
ADR-0005 + ADR-0027). It is a *structural* property, not a convention an actor
can quietly dissolve: a contract is not green-eligible until a red observation
for it exists at HEAD.

Two corrections to the v1 shape, both load-bearing:

- **Red/green observations are forensic, not a promotion gate.** They are the
  audit trail that a contract went red→green at a given commit — read after the
  fact to locate a gap, never the thing that admits a unit to `healthy`
  (v1 ADR-0005, 2026-05-18: *"Neither artefact is a promotion gate"*). This
  corrects ADR-0005's own original decision-point-6 chain-reader-gate, which
  was aspirational and never landed.
- **Enforcement is orchestrator-imposed ordering, not agent-role separation.**
  v1 enforced red-before-green by splitting authorship across a `test-builder`
  and a `build-rust` agent ("neither crosses"). v2's node actor is a **single
  pi session** that owns everything inside a node, so that split is gone.
  Instead the **spine** (ADR-0005) enforces ordering over pi's event stream: a
  contract's red observation must precede its green observation in the event
  store. *How* those observations are read off pi's lifecycle stream is the
  pi-adapter mapping, and whether the red observation is a hard structural
  precondition or a forensic expectation is refined where the event types land
  (`packages/core`, ADR-0006).

### 3. A third proof mode: **operator-attested** (dogfood-only)

Some surfaces have *neither* an honest scripted UAT *nor* an isolatable
automated test — the orchestrator's own routing discipline, the approval and
steering policy, a guardrail whose only real exercise is the system being
dogfooded. ADR-0002's capability/contract trichotomy has no tier for them.
Forcing one is the failure ADR-0008's seam forbids: a UAT authored against a
mock-shaped or by-eye proxy is UAT-theatre.

v2 adds a third proof mode, **operator-attested**: a unit is promoted by an
explicit, operator-granted, **auditable** attestation, recorded as a *typed
signed event*. This is v1 ADR-0024's `manual_signings` mechanism carried
forward into the event store (ADR-0006), with its non-negotiable properties
intact:

- The attestation is **per-unit and operator-granted** — *an agent cannot
  self-exempt*. It is a deliberate, visible act, never a default.
- It is **distinguishable in the audit trail** from a UAT walkthrough sign, so
  an operator-attested unit never silently passes for a UAT-proven one.

This **overrules v1 ADR-0028 D16**, which slated ADR-0024 for retirement on the
rationale that "a pure automated-test unit is the contract tier" — false for
these units, which have no honest automated test. The class is real and
recurring precisely because v2's own self-building orchestrator *is* such a
surface.

Operator-attested is an *earned* mode that reaches `healthy` (the attestation
is the proof) — not `mapped`, the weaker, observational, never-`healthy`
brownfield state (glossary).

### 4. Cold-rebuild convergence is the health invariant

Across all three modes, the test of whether a unit is genuinely proven is
**cold-rebuild convergence** (carried from v1 ADR-0006 + ADR-0027): *a unit is
healthy iff an agent starting cold — from the unit's own spec plus its
transitive upstream specs, and nothing else — can drive it red→green.* This is
the differentiating bet, and it is *why* the dependency rule holds:
"you cannot prove a capability that stands on an unproven one" (glossary) falls
out, because the cold agent could not walk the downstream journey on an
unproven upstream.

This is the **cold-rebuild** sense of convergence — distinct from the
DAG-stabilisation sense (driving the capability graph to a fixed point *before*
any contract goes red), which lives with the decomposition loop
(`open-questions.md` §4) and the scheduler.

## What this does NOT decide

- **How proof is persisted, and who attests.** Whether red/green observations,
  UAT verdicts, and operator attestations live as events, files, or both, and
  what `signer`/identity backs an attestation with no single human/subscription
  — both stay open (`open-questions.md` §1). v1's committed-JSONL-plus-
  `uat_signings` shape does **not** carry; the v2 form lands with the event
  schema (ADR-0006).
- **Who signs a UAT promotion** (human-in-the-studio vs autonomous agent vs
  hybrid) — the promotion act and its surface belong to ADR-0008; this ADR
  fixes only the *proof modes*, not the approval ceremony.
- **The exact red-ordering enforcement** (hard structural precondition vs
  forensic expectation over pi's stream) — refined with the event types
  (`packages/core`, ADR-0006) and the spine (ADR-0005).
- **The brownfield mapping mechanism** for `mapped` (`open-questions.md` §2),
  and **the decomposition/convergence loop** that stabilises the DAG before
  proof begins (`open-questions.md` §4).

## Alternatives considered

- **Keep red-green at the whole-unit (story) scope, as in v1.** Rejected.
  v1 ADR-0027 already relocated the floor to the contract, the only tier with
  an automated test; a capability's proof is its *integrated* UAT, which is not
  a thing you "redden." Pinning red-green to the coarse unit reproduces the
  behaviour-grain fragmentation ADR-0002 designed out.
- **Two proof modes only (capability/contract), forcing guardrail surfaces
  into a degenerate UAT or a fake test.** Rejected — this is exactly the
  UAT-theatre v1 ADR-0008's mock-UAT seam forbids, and re-creates v1's hidden
  `mapped`/`synthetic` subtype mess. The honest statement is that these surfaces
  are verified by dogfooding; **operator-attested** encodes that (v1 ADR-0024).
- **Carry forward v1's chain-reader as a promotion gate.** Rejected — it never
  landed in v1 and was explicitly corrected to forensic-only (v1 ADR-0005,
  2026-05-18). Promotion is a signature act (ADR-0008), not a chain read.
- **Re-impose v1's two-agent red/green authorship split** (`test-builder` vs
  `build-rust`). Rejected — v2 drives one pi session per node; ordering is
  enforced by the spine over the event stream, not by splitting the actor.

## Consequences

**Gained.** ADR-0002's proof-mode boundary becomes operational: each tier has a
named discipline, red-green sits where the automated test is, and the
behavioural/guardrail surfaces v2's *own* orchestrator exhibits have an honest,
auditable home instead of a faked UAT. Cold-rebuild convergence is the single
health invariant under which all three modes are judged.

**Paid.** A third proof mode to model and render, and an `operator-attested`
escape hatch that must stay operator-granted and auditable or it erodes the
gate's credibility — the load-bearing safety is that an agent cannot
self-exempt. Red-ordering enforcement over a single pi session is new work for
the spine and the pi-adapter (it was free in v1's multi-agent split).

## References

- ADR-0002 — the proof-mode boundary this operationalizes; UAT-generated edges.
- ADR-0005 (v2) — the spine that enforces contract red→green ordering.
- ADR-0006 (v2) — the event store and pi-adapter mapping; where proof-event
  types and the red-ordering precondition land.
- ADR-0008 (v2) — the promotion/approval ceremony and who signs a UAT.
- `docs/glossary.md` — `contract`, `capability`, `UAT`, `contract test`,
  `dependency`, `mock-UAT seam`, `red-green`, `evidence`, `healthy`, `mapped`.
  New terms (`operator-attested`, `cold-rebuild`) are proposed alongside this ADR.
- `docs/open-questions.md` — §1 (evidence & attestation), §2 (brownfield
  mapping), §4 (decomposition/convergence loop).
- v1 corpus (`C:\code\Agentic`): `docs/decisions/0005-*`, `0006-*`, `0008-*`,
  `0024-*`, `0027-*` — the carried principles above. **Overrules** ADR-0028 D16
  (which slated ADR-0024 for retirement).
