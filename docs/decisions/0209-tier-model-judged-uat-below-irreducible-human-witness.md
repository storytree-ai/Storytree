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

**PARTLY REVERSED — read this before the body (corrected in place 2026-07-26, extended 2026-08-05,
ADR-0139).** This ADR remains `accepted` because part of it is still current state, but it is NOT
current in full. Amended TWICE — by
[ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md) (D1–D4) and by
[ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) (D5's canonicality
direction):

- **D1–D4 are REVERSED. Do not read them as doctrine.** The `model` witness kind, the
  `advanced`/`frontier` capability tiers, the independent read-only model judge, and the model-tier
  escalation ladder are retired. **The UAT witness split is binary: `human` or `machine`.** The
  reasoning below is kept as the historical record of why the third rung was tried, not as guidance.
- **D5, D6 and D7 STAND and are load-bearing today — but D5 no longer stands *unchanged*.**
  Per-criterion detail artifacts, verdict anchoring to a detail-artifact revision, and the concise
  Studio row were justified independently of the model tier and survive it intact. **Nothing in the
  ADR-0247 reversal touches the detail-artifact machinery.** What DID later move is D5's canonicality
  direction — see the next bullet.
- **D5's `seed-canonical` half is DEAD (added in place 2026-08-05, ADR-0139).** Amended by
  [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md): its D5 withdraws
  the seed-canonical posture this ADR extended from ADR-0055 "wherever it was extended", so the
  `uat-criterion` detail kind is **live-canonical like every other kind**. Landed 2026-08-05 — the 70
  committed detail bodies were migrated into the live store and `apps/studio/data/seed-kinds/` was
  deleted, leaving 74 live artifacts (the seed and the store had each held rows the other did not).
  A detail artifact is now read and written with `storytree library artifact <story>#uat-<n> --pg`;
  there is no committed detail file and none may be recreated. **D5's substance is untouched** — one
  detail artifact per detailed criterion, owned by `story-author`, authored atomically with the
  hierarchy — which is why 0307's edge is an `amends`, not a second supersession.
- **D8 is COMPLETE.** The pilot ran and the corpus-wide migration finished on 2026-07-26: 26 stories
  adjudicated leg by leg produced **zero** `model` legs, and the final corpus measures 42 human /
  214 machine / 0 model / 0 either across 256 legs. That null result is the evidence base for
  ADR-0247, and it satisfies D8's own condition for retiring the `either` compatibility parse state.

This is a partial reversal, so the edge is `amends`, never `supersedes` (ADR-0139), and the status
stays `accepted` for the parts that hold. A genuine re-decision is copy-on-write — the re-decision
lives in ADR-0247, and nothing below has been rewritten to say something it did not say in 2026-07-17.

## Context

> *This section is the 2026-07-17 reasoning that motivated D1–D4, preserved as history. It is not a
> description of current state: the corpus-wide migration it called for measured the opposite (see D8
> and ADR-0247). In particular there is no UAT judge registry and no admitted frontier UAT judge —
> Fable or otherwise — because there is no model witness kind at all.*

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
retired metered Cursor SDK execution. [ADR-0232](0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md)
now admits a ChatGPT-subscription Codex **builder** behind `PhaseAuthor`, but that does not
automatically admit any GPT model as the separate read-only UAT judge. Fable remains the only
frontier UAT judge until the registry and judge integration explicitly admit a Codex-backed model.

## Decision

> **Currency map (corrected in place 2026-07-26, extended 2026-08-05, ADR-0139).** D1–D4 REVERSED by
> ADR-0247 · D5–D7 STAND, load-bearing, but D5's `seed-canonical` half is REVERSED by ADR-0307 D5 ·
> D8 COMPLETE. Each decision below is marked. A reversed decision is history; it is not the rule, and
> re-introducing it needs an ADR that supersedes ADR-0247 (for D1–D4) or ADR-0307 (for D5's direction).

1. **[REVERSED by ADR-0247 — the witness split is binary, `human` or `machine`; there is no `model`
   witness kind.]** **Add `model` as a distinct per-criterion witness.** UAT criteria resolve to one of three honest
   witness kinds:
   - `machine` — deterministic, spine-observed proof;
   - `model` — rubric-bound semantic judgment by an eligible read-only model judge;
   - `human` — irreducible operator judgment.

   `model` is not a subtype or spelling of `machine`. Existing deterministic machine proofs and their
   reliability-gate bindings keep their current semantics.

2. **[REVERSED by ADR-0247 — there are no `advanced`/`frontier` capability tiers and no UAT judge
   registry; a criterion carries no model tier.]** **Preclassify a minimum model capability tier.** Every model-witness criterion declares one of:
   - `advanced` — an explicitly registered Opus-class model or approved equivalent;
   - `frontier` — Fable today, with other models admitted only by an explicit registry change backed
     by an available, approved runtime.

   A stronger registered judge may substitute for a lower tier. Anything below the `advanced`
   allowlist is prohibited from judging UAT. The registry is versioned and explicit; providers and
   models never self-declare equivalence. An unavailable required tier holds the criterion rather
   than downgrading it, silently routing it to a lower model, or treating it as human.

3. **[REVERSED by ADR-0247 — there is no independent read-only model judge in the UAT path. The
   spine-signs-not-the-leaf rule this rested on is ADR-0020's and is untouched.]** **Keep model judgment independent and spine-signed.** The judge runs separately from the builder,
   with fresh context and no write tools. It returns structured `PASS | FAIL | INCONCLUSIVE` output
   with criterion-by-criterion evidence references and rationale. The deterministic spine validates
   the output shape, model eligibility, criterion tier, clean anchor, and evidence bindings, then
   records the signed verdict. The model never writes or signs its own green.

4. **[REVERSED by ADR-0247 — there is no model-tier escalation ladder. Its last clause survives on its
   own footing: a `human` criterion goes to the staged operator attestation because its judgment is
   irreducible, never because a harness is missing (`asset:human-witness-is-a-judgment-gap-not-cost`,
   ADR-0184).]** **Escalate by declared capability without laundering failure.**
   - An `advanced` INCONCLUSIVE escalates to an available frontier judge.
   - A frontier INCONCLUSIVE may exceptionally escalate to a human.
   - A FAIL at any eligible model tier remains red and returns to implementation or rubric repair; a
     human cannot override it into green.
   - A criterion declared `human` goes directly to the staged operator-attestation experience
     because its judgment is irreducible, not because a model is unavailable or inconvenient.

   One eligible judge is sufficient at each tier; Fable and any future peer frontier model do not
   both have to agree unless a later criterion explicitly introduces a stronger risk policy.

5. **[STANDS — current state, load-bearing — with TWO clauses void. (a) "and minimum model tier" in
   the first sentence is void with D2: a criterion declares a witness kind and no tier. (b) The
   `seed-canonical` sentence is void with ADR-0307 D5: the kind is LIVE-canonical, authored through
   `storytree library artifact … --pg`, and the committed seed directory is deleted. Everything else
   here is unchanged and live — the detail tier measured 74 live artifacts on 2026-08-05.]**
   **Create one Library artifact per detailed UAT criterion.** The story remains the
   authority for the stable criterion id, canonical one-line title, witness kind, and minimum model
   tier. Its criterion points to a new detailed UAT artifact whose body carries the action, success
   conditions, evidence expectations, and references to reusable Library principles/processes.
   ~~This kind is seed-canonical and reconciled into the live Library, extending ADR-0055's
   seed-canonical exception beyond agents so offline builds and CI can resolve the same proof
   contract.~~ *(Void with ADR-0307 D5 — the stated reason, "offline builds and CI can resolve the
   same proof contract", is the exact capability ADR-0302 D2/D3 retired, so the rule went with it.)*
   The `story-author` owns these artifacts together with the hierarchy and may author the
   pair atomically. *(The pair is still authored together; only the second half's MEDIUM changed,
   from a committed file to a live `--pg` write.)*

6. **[STANDS — current state, load-bearing. Read "a model or human UAT verdict" as "a UAT verdict":
   the anchoring rule applies to every witness kind that remains, which is `human` and `machine`.]**
   **Anchor verdicts to criterion detail.** A model or human UAT verdict records the referenced
   artifact revision/hash. Any substantive artifact change invalidates the old green. The story
   title remains display-canonical; the artifact may not silently redefine it.

7. **[STANDS UNCHANGED — current state, load-bearing.]** **Make the Studio row concise.** The story detail panel renders the story-owned one-line title.
   Opening the row follows its Library pointer to the full criterion artifact. Shared procedures
   remain ordinary Library principles, patterns, and processes and are referenced rather than
   copied. No generic template may erase story-specific success evidence.

8. **[COMPLETE 2026-07-26 — the migration ran and RETURNED A NULL RESULT.]** The three-story pilot
   ran and corpus-wide migration followed: 26 stories adjudicated leg by leg, each briefed with
   `asset:human-witness-is-a-judgment-gap-not-cost` and explicitly told to hunt for model-judgeable
   work, produced **zero** `model` legs — including `uat-attestation` (which builds the attestation
   machinery) and `feedback-graduation` (whose subject is judgment). Final measured corpus: 42 human /
   214 machine / 0 model / 0 either across 256 legs. That killed the premise of D1–D4 (ADR-0247) and
   met this decision's own condition for retiring the `either` compatibility parse state, which
   ADR-0247 D4 now does. **Nothing here remains to be executed.** The original instruction follows as
   the historical record of what was run.
   **Migrate explicitly, beginning with a three-story pilot.** No untagged criterion inherits a new
   model default. Until migration reaches it, an existing untagged criterion may retain `either`
   strictly as a legacy-unresolved parse state on its current conservative path; `either` is not a
   fourth classified witness, cannot carry a model tier, and can never enter model judgment. The
   `story-author` classifies each pilot leg as deterministic `machine`, tiered `model`, or irreducible
   `human`, and creates its detailed artifact. The pilot is: `drive-machinery` as the deterministic
   control, `library-review` as the mixed knowledge workflow, and `library-tech-tree-overlay` as the
   visual frontend. Corpus-wide migration is a later increment informed by this pilot; only that
   completed migration retires the compatibility parse state.

## Consequences

> **These were the CONSEQUENCES PREDICTED in 2026-07-17, not a report of what happened.** Every
> consequence below that turns on the `model` tier is void with D1–D4; the migration measured the
> opposite of the first two "Good" bullets. Only the detail-artifact consequences (the Studio-row
> bullet and the re-attestation cost) describe current state — the two `seed-canonical` bullets went
> void with ADR-0307 D5 and are struck below. ADR-0247's own Consequences section is the current one.

**Good.**

- ~~Human UAT becomes a scarce judgment rung rather than the default destination for semantic checks.~~
  *(Void with D1. Human UAT did become scarce — 42 of 256 legs — but by the machine rung absorbing the
  work, not by a model rung: the sweep found zero criteria a model judge would serve better.)*
- ~~Model judgment is visible, auditable, capability-gated, and distinct from deterministic proof.~~
  *(Void with D1–D3 — no model judgment enters the UAT path.)*
- ~~A builder cannot self-approve, an ineligible cheap model cannot judge, and a model FAIL cannot be
  laundered through an operator click.~~ *(The model clauses are void with D1–D3. The
  builder-cannot-self-approve rule is ADR-0020's and is untouched by the reversal.)*
- Story panels stay scannable while full acceptance detail remains addressable and versioned.
- ~~Seed-canonical detail makes the judged contract reproducible in offline tests and CI.~~ *(Void
  with ADR-0307 D5 — offline is no longer a supported mode at all (ADR-0302 D2), so this benefit had
  nothing left to buy. The detail tier is live-canonical and CI now holds a DB credential (D3).)*

**Cost / watch.**

- ~~The proof protocol, witness resolution, verdict provenance, Library schema/sync machinery, Studio,
  CLI, and story-author authority all gain a new concept.~~ *(This cost was paid and then found not to
  earn its keep — the concept never reached a single leg. Its unwinding is ADR-0247 D5.)*
- ~~A second seed-canonical Library kind is an intentional exception to the live-canonical default and
  needs its own fail-closed reconciliation checks.~~ *(Void with ADR-0307 D5. The cost is worth
  keeping as history because it was PAID and then found unearned: the reconciler this bullet called
  for was written (`packages/uat-criterion/src/detail-seed-sync.ts`) but never wired to a caller —
  the `loadCorpus` and `sync-uat-details --pg` consumers named in its own doc comment never existed —
  so the 70 committed detail files were carried into the corpus by nothing, and 52 of them ended up
  existing in no other place. The exception is withdrawn and the reconciler is deleted.)*
- Per-criterion artifacts increase corpus volume. ~~The pilot must measure whether the navigation and
  authoring cost is justified before bulk migration.~~ *(Measured: the migration completed and judged
  the per-criterion detail its most valuable output — ADR-0247 D3. The volume cost stands, the open
  question does not.)*
- ~~Fable availability is currently a hard dependency for frontier UAT. A subscription-funded Codex
  builder now exists, but GPT-5.6 Sol is not admitted by proximity; the independent read-only judge
  registry/integration must still admit it explicitly.~~ *(Void with D2–D3 — the UAT path has no
  frontier-judge dependency at all. This cost was part of why the tier was retired.)*
- Artifact hashes invalidate stale green honestly, which may create re-attestation work after rubric
  edits.

## References

- [ADR-0247](0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md) — **amends this
  ADR**: D1–D4 reversed, D5–D7 stand, D8 complete. Read it for current state. Note its D3 restated
  D5's now-void `seed-canonical` clause in its own words; that restatement is annotated there.
- [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) — **also amends this
  ADR**: its D5 withdraws D5's seed-canonical direction here (and supersedes ADR-0055 outright), so
  the `uat-criterion` detail kind is live-canonical. D5's substance is untouched.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why the reversal
  is annotated in this body in place rather than left for the reader to discover elsewhere.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the spine observes and
  signs; leaves do not self-certify. *(Link corrected 2026-07-26 — the slug had rotted.)*
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — amended from one
  seed-canonical kind to an explicit seed-canonical class. ~~**This amendment STANDS** (it is D5's,
  not D1's).~~ **This amendment is UNDONE by ADR-0307**: 0055 is superseded outright and the class it
  established has no members left — every kind is live-canonical. *(Link corrected 2026-07-26 — the
  slug had rotted.)*
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) — amended
  from binary human/machine per-test proof to include model witness. **This amendment is UNDONE by
  ADR-0247**: ADR-0082's binary human/machine per-test proof is current state again. *(Link corrected
  2026-07-26 — the slug had rotted.)*
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) — amended from
  binary witness resolution. **This amendment is UNDONE by ADR-0247**: witness resolution is binary
  again, and ADR-0247 D4 further tightens it by retiring the `either` parse state.
- [ADR-0184](0184-machine-witness-drive-machinery-s-three-live-uat-legs.md) — the human-witness
  judgment-gap rule stands ~~and now has a model rung beneath it~~. **There is no rung beneath it**
  (ADR-0247); the rule itself is untouched and was the instrument the migration applied leg by leg.
- [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md) — Cursor SDK
  billing remains retired.
- `packages/library/src/uat-test-criteria.ts`
- `packages/orchestrator/src/proof/uat-proof.ts`
- `apps/studio/src/components/TreeView.tsx`
