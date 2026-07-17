---
status: accepted
decided: 2026-07-17
amends: [55, 82, 106, 184]
load_bearing: true
arc: model-uat-promotion
---
# ADR-0209: Tier model-judged UAT below irreducible human witness

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The corpus has accumulated too many human-witness UAT criteria. A read-only corpus probe found about
97 explicitly human-tagged legs, plus untagged legs that conservatively resolve to human. That is not
an honest measure of irreducible human judgment: many criteria need semantic evaluation but do not
need a person, while existing `machine` witness means deterministic spine-observed proof and cannot
express probabilistic model judgment.

The current binary witness model therefore creates two bad incentives. Authors either label a
model-judgeable criterion `human`, growing an avoidable owner queue, or call it `machine`, hiding a
materially different trust path behind deterministic-proof vocabulary. Human review must remain the
last rung for look, feel, lived experience, live risk, spend, and exceptional evidence that even the
strongest admitted model cannot judge — never a proxy for harness cost.

The story panel also renders each criterion's parsed title verbatim. Inconsistent bold leads have
turned detailed procedures into long table rows. A corpus probe found reusable UAT material at the
rubric and ceremony layer, but most detailed action/success prose is criterion-specific. The owner
directed that this detail become an addressable Library artifact per criterion while the story keeps
the canonical one-line acceptance intent.

The runtime constraint is deliberate. [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)
retired metered Cursor SDK execution. The admitted live inner loop remains the Claude Agent SDK on
subscription auth. Fable is therefore the only frontier UAT judge admitted now; GPT-5.6 Sol is a
future frontier candidate only after a separate subscription-funded OpenAI runtime is available and
admitted.

## Decision

1. **Add `model` as a distinct per-criterion witness.** UAT criteria resolve to one of three honest
   witness kinds:
   - `machine` — deterministic, spine-observed proof;
   - `model` — rubric-bound semantic judgment by an eligible read-only model judge;
   - `human` — irreducible operator judgment.

   `model` is not a subtype or spelling of `machine`. Existing deterministic machine proofs and their
   reliability-gate bindings keep their current semantics.

2. **Preclassify a minimum model capability tier.** Every model-witness criterion declares one of:
   - `advanced` — an explicitly registered Opus-class model or approved equivalent;
   - `frontier` — Fable today, with other models admitted only by an explicit registry change backed
     by an available, approved runtime.

   A stronger registered judge may substitute for a lower tier. Anything below the `advanced`
   allowlist is prohibited from judging UAT. The registry is versioned and explicit; providers and
   models never self-declare equivalence. An unavailable required tier holds the criterion rather
   than downgrading it, silently routing it to a lower model, or treating it as human.

3. **Keep model judgment independent and spine-signed.** The judge runs separately from the builder,
   with fresh context and no write tools. It returns structured `PASS | FAIL | INCONCLUSIVE` output
   with criterion-by-criterion evidence references and rationale. The deterministic spine validates
   the output shape, model eligibility, criterion tier, clean anchor, and evidence bindings, then
   records the signed verdict. The model never writes or signs its own green.

4. **Escalate by declared capability without laundering failure.**
   - An `advanced` INCONCLUSIVE escalates to an available frontier judge.
   - A frontier INCONCLUSIVE may exceptionally escalate to a human.
   - A FAIL at any eligible model tier remains red and returns to implementation or rubric repair; a
     human cannot override it into green.
   - A criterion declared `human` goes directly to the staged operator-attestation experience
     because its judgment is irreducible, not because a model is unavailable or inconvenient.

   One eligible judge is sufficient at each tier; Fable and any future peer frontier model do not
   both have to agree unless a later criterion explicitly introduces a stronger risk policy.

5. **Create one seed-canonical Library artifact per detailed UAT criterion.** The story remains the
   authority for the stable criterion id, canonical one-line title, witness kind, and minimum model
   tier. Its criterion points to a new detailed UAT artifact whose body carries the action, success
   conditions, evidence expectations, and references to reusable Library principles/processes.
   This kind is seed-canonical and reconciled into the live Library, extending ADR-0055's
   seed-canonical exception beyond agents so offline builds and CI can resolve the same proof
   contract. The `story-author` owns these artifacts together with the hierarchy and may author the
   pair atomically.

6. **Anchor verdicts to criterion detail.** A model or human UAT verdict records the referenced
   artifact revision/hash. Any substantive artifact change invalidates the old green. The story
   title remains display-canonical; the artifact may not silently redefine it.

7. **Make the Studio row concise.** The story detail panel renders the story-owned one-line title.
   Opening the row follows its Library pointer to the full criterion artifact. Shared procedures
   remain ordinary Library principles, patterns, and processes and are referenced rather than
   copied. No generic template may erase story-specific success evidence.

8. **Migrate explicitly, beginning with a three-story pilot.** No untagged criterion inherits a new
   model default. Until migration reaches it, an existing untagged criterion may retain `either`
   strictly as a legacy-unresolved parse state on its current conservative path; `either` is not a
   fourth classified witness, cannot carry a model tier, and can never enter model judgment. The
   `story-author` classifies each pilot leg as deterministic `machine`, tiered `model`, or irreducible
   `human`, and creates its detailed artifact. The pilot is: `drive-machinery` as the deterministic
   control, `library-review` as the mixed knowledge workflow, and `library-tech-tree-overlay` as the
   visual frontend. Corpus-wide migration is a later increment informed by this pilot; only that
   completed migration retires the compatibility parse state.

## Consequences

**Good.**

- Human UAT becomes a scarce judgment rung rather than the default destination for semantic checks.
- Model judgment is visible, auditable, capability-gated, and distinct from deterministic proof.
- A builder cannot self-approve, an ineligible cheap model cannot judge, and a model FAIL cannot be
  laundered through an operator click.
- Story panels stay scannable while full acceptance detail remains addressable and versioned.
- Seed-canonical detail makes the judged contract reproducible in offline tests and CI.

**Cost / watch.**

- The proof protocol, witness resolution, verdict provenance, Library schema/sync machinery, Studio,
  CLI, and story-author authority all gain a new concept.
- A second seed-canonical Library kind is an intentional exception to the live-canonical default and
  needs its own fail-closed reconciliation checks.
- Per-criterion artifacts increase corpus volume. The pilot must measure whether the navigation and
  authoring cost is justified before bulk migration.
- Fable availability is currently a hard dependency for frontier UAT. GPT-5.6 Sol is not admitted by
  aspiration alone; a future runtime decision must settle subscription funding and integration.
- Artifact hashes invalidate stale green honestly, which may create re-attestation work after rubric
  edits.

## References

- [ADR-0020](0020-prove-it-gate-build-the-spine-side-red-green-machine.md) — the spine observes and
  signs; leaves do not self-certify.
- [ADR-0055](0055-library-agents-are-seed-canonical-and-sync-to-the-live-store.md) — amended from one
  seed-canonical kind to an explicit seed-canonical class.
- [ADR-0082](0082-per-test-uat-test-criteria-earn-green-by-declared-witness-story-uat.md) — amended
  from binary human/machine per-test proof to include model witness.
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) — amended from
  binary witness resolution.
- [ADR-0184](0184-machine-witness-drive-machinery-s-three-live-uat-legs.md) — the human-witness
  judgment-gap rule stands and now has a model rung beneath it.
- [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md) — Cursor SDK
  billing remains retired.
- `packages/library/src/uat-test-criteria.ts`
- `packages/orchestrator/src/proof/uat-proof.ts`
- `apps/studio/src/components/TreeView.tsx`
