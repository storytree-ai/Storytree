# Pre-removal citation snapshot — 2026-08-30

Frozen under **ADR-0477 D2**, BEFORE the library's `references` field is removed from the schema
and its data dropped. That removal is step 4 of `citation-tier-retirement-arc`; this file precedes
it, which is the whole point of freezing it. **Once the removal lands, this file is the ONLY record
of what each artifact was written from.** Nothing else carries it: the removal DESTROYS provenance
rather than hiding it, and no later session can reconstruct the citation graph from anything that
remains.

If you are reading this and the field still exists, the removal has not landed yet — read the live
data, not this file. If it does not exist, this file is all there is.

## What this file is, for a reader who has none of the context

Every artifact in the storytree Library used to carry a `references` list — the artifacts and
documents it was written FROM. It rendered as a `Sources:` block at the foot of every artifact
read. It answered a provenance question: *where did this come from*.

The owner judged it noise on 2026-08-29 — *"the end goal is really to just have the depends_on
edge, these citations in my opinion are noise"* — and chose deletion over merely hiding it,
knowing that destroys provenance. **ADR-0477** records that decision and the four-step order
that made it safe: census the readers, freeze this snapshot, stop rendering, then remove.

The surviving edge is `depends_on` — a DIFFERENT and deliberately authored claim, saying what a
thing RESTS ON rather than what it was written from. It is not a rename of this data and does
not carry it. Reading `depends_on` will not tell you what is in this file.

**The two questions this file answers, and how:**

- *What was artifact X written from?* — the table is sorted by citing artifact. Find X in the
  first column; its rows are its citations, in the order they were authored.
- *What used to point at artifact Y?* — search the file for `asset:Y`. Every row whose `ref`
  cell holds that token is an artifact that cited Y. There is no separate reverse index: one
  table with a text search answers both, and a second copy would be a drift surface.

## How to read a `ref`

| spelling | means |
| --- | --- |
| `asset:<id>` | another Library artifact, by id. The `resolves to` column gives its title and kind AS AT THE FREEZE. |
| `doc:<relpath>` | a repo file path. Most point into `docs/decisions/`, a directory ADR-0403 deleted when decisions became ordinary store rows — **645 of the 683 do, and the `resolves to` column already resolves every one of them to its live `adr-NNNN` row, so you do not have to.** The remaining 38 are ordinary repo paths. |
| `node:<id>` | a work-tree node (a story or capability), not a Library artifact. |
| `story:<id>` / `capability:<id>` | typed work-hierarchy pointers (ADR-0306 D1). |
| anything else | malformed — authored without a prefix. Preserved verbatim; see the counts. |

**Titles are frozen at the moment of the freeze.** An artifact renamed or retired after
2026-08-30 will not match this file, and that is the file behaving correctly: it is a record of a
past state, not a live view. It is never regenerated and never edited (the ADR-0431 precedent,
`docs/research/amends-edge-snapshot-2026-08-23.md`, which froze 517 `amends` edges the same way
and is now the sole surviving record of which decision narrowed which).

## Counts at the freeze

Taken from the live store (`events.library_artifact`), which is the only source of truth for
artifact state (ADR-0302 D1 / ADR-0307). Any instrument parsing this file should re-derive
these and report a disagreement rather than trusting the row count — a truncation would
otherwise read exactly like a truthful record of a smaller corpus.

| measure | value |
| --- | --- |
| artifacts in the corpus | 2656 |
| artifacts carrying >=1 reference | 891 |
| total references | 4116 |
| `asset:` references | 3316 |
| `doc:` references | 683 |
| `node:` references | 102 |
| (malformed) references | 13 |
| `story:` references | 2 |
| `asset:` references whose target is not a live row | 1 |
| `doc:` references naming a DECISION (resolved to its live `adr-NNNN` row) | 645 of 645 |
| `doc:` references naming an ordinary repo path | 38 |

### By citing kind

| kind | artifacts | carrying >=1 ref | references |
| --- | ---: | ---: | ---: |
| adr | 470 | 319 | 2089 |
| principle | 95 | 89 | 530 |
| friction | 572 | 287 | 526 |
| definition | 53 | 48 | 244 |
| agent | 13 | 11 | 186 |
| process | 21 | 21 | 163 |
| increment | 1191 | 35 | 127 |
| pattern | 28 | 26 | 116 |
| guardrail | 22 | 22 | 68 |
| arc | 113 | 10 | 28 |
| techstack | 7 | 7 | 23 |
| open-question | 25 | 16 | 16 |
| uat-criterion | 33 | 0 | 0 |
| template | 13 | 0 | 0 |

## Every citation

Sorted by citing artifact, then by the order the refs were authored on that artifact.

| citing artifact | kind | ref | resolves to |
| --- | --- | --- | --- |
| `a-behaviour-can-be-proven-by-a-running-suite-and-claimed-by-no-contract` | friction | `node:wisp-as-story-claim` | _(a work-tree node — story or capability)_ |
| `a-behaviour-can-be-proven-by-a-running-suite-and-claimed-by-no-contract` | friction | `node:claim-store-work-time` | _(a work-tree node — story or capability)_ |
| `a-behaviour-can-be-proven-by-a-running-suite-and-claimed-by-no-contract` | friction | `node:render-core` | _(a work-tree node — story or capability)_ |
| `ab-file-swap-races-a-background-gate` | friction | `asset:adr-0469` | The regrow cursor is owned by wall-clock time, so a run survives being unwatched [adr] |
| `ab-file-swap-races-a-background-gate` | friction | `node:act2-intro-cursor` | _(a work-tree node — story or capability)_ |
| `a-capability-with-no-real-arm-cannot-declare-a-coverage-surface` | friction | `node:render-core` | _(a work-tree node — story or capability)_ |
| `a-capability-with-no-real-arm-cannot-declare-a-coverage-surface` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `accepted-adr-can-be-an-empty-untracked-scaffold` | friction | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `accepted-adr-decision-with-no-executor-is-silent` | friction | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `accepted-adr-decision-with-no-executor-is-silent` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `accepted-adrs-carry-no-stale-prose` | principle | `asset:survival-test-for-adrs` | The survival test for ADRs [principle] |
| `accepted-adrs-carry-no-stale-prose` | principle | `doc:decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr, now `adr-0139`] |
| `a-committed-decision-picture-has-no-link-to-what-it-depicts` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `a-committed-decision-picture-has-no-link-to-what-it-depicts` | friction | `doc:decisions/0293-the-chapter-2-growth-track-grows-the-wood-first-and-flushes.md` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr, now `adr-0293`] |
| `a-committed-decision-picture-has-no-link-to-what-it-depicts` | friction | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `asset:legible-at-the-resting-view` | Legible at the resting view [principle] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `asset:meaning-outranks-appearance` | Meaning outranks appearance [principle] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `asset:observability-first` | Observability-first [principle] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `doc:decisions/0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr, now `adr-0069`] |
| `a-connector-that-does-not-connect-is-a-defect` | principle | `doc:decisions/0367-chapter-2-s-land-is-rendered-in-blender-too-an-angled-citybu.md` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr, now `adr-0367`] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:uat-proves-the-goal-not-the-surface` | UAT proves the goal, not the surface [principle] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:render-and-witness-a-flag-guarded-surface` | Render and witness a flag-guarded surface [pattern] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:a-green-positional-oracle-is-necessary-not-sufficient` | A green positional oracle is necessary, not sufficient [principle] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:operator-attested` | operator-attested [definition] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `asset:contract` | contract [definition] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `doc:decisions/0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md` | Studio map responsiveness — cache and defer before cutting density [adr, now `adr-0240`] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `a-contract-that-says-observable-must-name-its-observer` | principle | `doc:decisions/0122-per-contract-coverage-check-map-each-declared-contract-to-an.md` | Per-contract coverage check: map each declared contract to an observed test [adr, now `adr-0122`] |
| `a-custom-real-proof-command-cannot-prove-red-by-assertion` | friction | `node:act2-regrow-camera-zoom-out` | _(a work-tree node — story or capability)_ |
| `a-custom-real-proof-command-cannot-prove-red-by-assertion` | friction | `doc:decisions/0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md` | Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate [adr, now `adr-0211`] |
| `a-decision-log-session-whose-arc-is-closed-has-no-claimable-node` | friction | `doc:decisions/0401-tsx-s-on-disk-transform-cache-stays-off-on-a-long-lived-box.md` | tsx's on-disk transform cache stays off on a long-lived box — the rot reproduces [adr, now `adr-0401`] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:escalate-inline-or-on-a-named-signal` | Escalate inline, or on a named signal [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:revalidate-instruments-when-a-decision-widens-a-domain` | Revalidate the instruments when a decision widens a domain [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:justify-a-gate-rung` | Justify a gate rung [process] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:calibrate-ceremony-to-stakes` | Calibrate ceremony to stakes [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `doc:decisions/0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md` | The librarian pass is trigger-gated and split, not per-landing [adr, now `adr-0324`] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `doc:decisions/0110-collapse-the-redundant-end-of-flow-adr-ratification.md` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr, now `adr-0110`] |
| `a-decision-that-blinds-an-instrument-escalates-inline` | principle | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `a-decision-widened-an-input-domain-an-instrument-still-assumed` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `a-decision-widened-an-input-domain-an-instrument-still-assumed` | friction | `doc:decisions/0293-the-chapter-2-growth-track-grows-the-wood-first-and-flushes.md` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr, now `adr-0293`] |
| `a-decision-widened-an-input-domain-an-instrument-still-assumed` | friction | `doc:decisions/0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md` | The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement [adr, now `adr-0289`] |
| `a-declared-gate-is-never-checked-to-be-runnable` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:survival-test-for-adrs` | The survival test for ADRs [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:price-the-deferral` | Price the deferral [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:arc` | Arc [definition] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `a-deferral-recorded-without-a-status-reads-as-pending-work` | principle | `doc:decisions/0256-deferral-keyed-escalation-lines-are-not-built-a-backstop-s-t.md` | Deferral-keyed escalation lines are not built: a backstop's trigger must be observable in-run [adr, now `adr-0256`] |
| `a-delivered-tool-remedy-cannot-be-stamped-without-minting-a-proposal-for-it` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `a-delivered-tool-remedy-cannot-be-stamped-without-minting-a-proposal-for-it` | friction | `doc:decisions/0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr, now `adr-0290`] |
| `a-delivered-tool-remedy-cannot-be-stamped-without-minting-a-proposal-for-it` | friction | `asset:friction-adjudication` | Friction adjudication [process] |
| `a-delivered-tool-remedy-cannot-be-stamped-without-minting-a-proposal-for-it` | friction | `asset:proposals-fold-into-arcs-arc` | Proposals fold into arcs [arc] |
| `a-directory-scoped-scan-narrows-silently-when-its-subject-moves` | friction | `asset:arc-tier-extraction-arc` | The arc domain owns its own package and story [arc] |
| `a-documented-fast-path-silently-swapped-the-artifact-it-modelled` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `a-documented-fast-path-silently-swapped-the-artifact-it-modelled` | friction | `doc:decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr, now `adr-0280`] |
| `adr-0001` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0001` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0001` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0001` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0001` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0002` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0002` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0002` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0003` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0003` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0003` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0003` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0004` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0004` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0004` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0005` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0005` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0005` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0005` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0006` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0006` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0006` | adr | `asset:adr-0350` | An event that caused another says so: causal edges on the event log [adr] |
| `adr-0007` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0007` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0007` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0008` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0008` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0008` | adr | `asset:adr-0043` | App-owned users, roles, and invitations from the UI [adr] |
| `adr-0008` | adr | `asset:adr-0204` | Retire the studio banner: full-bleed forest with a HUD avatar on the verified identity [adr] |
| `adr-0008` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0009` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0009` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0009` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0009` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0010` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0010` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0010` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0011` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0011` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0011` | adr | `asset:adr-0177` | Open the leaf-runtime seam to Cursor while keeping the deterministic spine [adr] |
| `adr-0011` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0011` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0011` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0011` | adr | `asset:adr-0003` | v1→v2 disposition ledger [adr] |
| `adr-0011` | adr | `asset:adr-0012` | Tool execution behind a borrowed, pluggable sandbox [adr] |
| `adr-0011` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0011` | adr | `asset:adr-0005` | Orchestration spine — code sequences, pi judges [adr] |
| `adr-0012` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0012` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0012` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0012` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0013` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0013` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0013` | adr | `asset:adr-0039` | JSON is the structured corpus source format — the pure-YAML unit migration is retired [adr] |
| `adr-0013` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0013` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0013` | adr | `asset:adr-0003` | v1→v2 disposition ledger [adr] |
| `adr-0014` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0014` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0014` | adr | `asset:adr-0027` | Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward [adr] |
| `adr-0014` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0014` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0014` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0014` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0014` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0015` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0015` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0015` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0015` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0015` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0015` | adr | `asset:adr-0114` | Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop [adr] |
| `adr-0015` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0015` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0015` | adr | `asset:adr-0012` | Tool execution behind a borrowed, pluggable sandbox [adr] |
| `adr-0015` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0016` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0016` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0016` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0016` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0016` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0016` | adr | `asset:adr-0012` | Tool execution behind a borrowed, pluggable sandbox [adr] |
| `adr-0017` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0017` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0017` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0017` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0017` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0017` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0017` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0018` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0018` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0018` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0018` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0018` | adr | `asset:adr-0135` | Retire docs/glossary.md; the Library is the sole term authority [adr] |
| `adr-0018` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0018` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0018` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0018` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0018` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0018` | adr | `asset:adr-0028` | Merge the v1 cautionary lessons into their positive counterparts — fold the scar evidence, retire the standalone units [adr] |
| `adr-0019` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0019` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0019` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0019` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0019` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0019` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0020` | adr | `asset:adr-0005` | Orchestration spine — code sequences, pi judges [adr] |
| `adr-0020` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0020` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0020` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0020` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0020` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0020` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0021` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0021` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0021` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0022` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0022` | adr | `asset:adr-0195` | Affected-only PR test scope: CI cost scales with the change, not the repo [adr] |
| `adr-0022` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0022` | adr | `asset:adr-0046` | Continuous deployment for the hosted studio (merge → deploy) [adr] |
| `adr-0023` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0023` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0023` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0023` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0023` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0023` | adr | `asset:adr-0201` | Prompt-keyed definition injection — a capped push at the moment of use [adr] |
| `adr-0023` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0023` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0023` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0023` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0023` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0024` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0024` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0024` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0024` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0024` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0024` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0025` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0025` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0025` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0025` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0025` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0025` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0025` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0026` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0026` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0026` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0026` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0026` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0026` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0026` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0026` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0026` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0026` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0027` | adr | `asset:adr-0014` | The notice board — anchored prose feedback that graduates into durable guidance [adr] |
| `adr-0027` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0027` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0027` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0027` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0027` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0027` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0028` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0028` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0028` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0028` | adr | `asset:adr-0026` | Library schema migrations & health checks — per-row version pin, forward-only migrate-on-write, and a gated health module [adr] |
| `adr-0028` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0029` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0029` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0029` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0029` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0029` | adr | `asset:adr-0026` | Library schema migrations & health checks — per-row version pin, forward-only migrate-on-write, and a gated health module [adr] |
| `adr-0029` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0029` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0029` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0029` | adr | `asset:adr-0005` | Orchestration spine — code sequences, pi judges [adr] |
| `adr-0029` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0029` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0029` | adr | `asset:adr-0014` | The notice board — anchored prose feedback that graduates into durable guidance [adr] |
| `adr-0029` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0029` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0030` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0030` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0030` | adr | `asset:adr-0012` | Tool execution behind a borrowed, pluggable sandbox [adr] |
| `adr-0030` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0030` | adr | `asset:adr-0177` | Open the leaf-runtime seam to Cursor while keeping the deterministic spine [adr] |
| `adr-0030` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0030` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0030` | adr | `asset:adr-0003` | v1→v2 disposition ledger [adr] |
| `adr-0030` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0031` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0031` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0031` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0031` | adr | `asset:adr-0315` | A verdict is never signed ahead of its package backstop [adr] |
| `adr-0032` | adr | `asset:adr-0027` | Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward [adr] |
| `adr-0032` | adr | `asset:adr-0014` | The notice board — anchored prose feedback that graduates into durable guidance [adr] |
| `adr-0032` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0032` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0032` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0032` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0032` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0032` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0033` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0033` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0033` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0033` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0033` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0033` | adr | `asset:adr-0199` | A build run never writes session presence [adr] |
| `adr-0033` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0033` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0033` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0033` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0033` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0033` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0033` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0033` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0033` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0033` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0035` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0035` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0035` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0036` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0036` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0036` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0036` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0036` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0036` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0036` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0036` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0037` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0037` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0037` | adr | `asset:adr-0027` | Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward [adr] |
| `adr-0037` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0037` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0037` | adr | `asset:adr-0026` | Library schema migrations & health checks — per-row version pin, forward-only migrate-on-write, and a gated health module [adr] |
| `adr-0037` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0037` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0037` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0037` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0037` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0037` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0037` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0037` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0038` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0038` | adr | `asset:adr-0296` | The world renders no capability-level unhealthy state — withdrawn from the picture, kept in the vocabulary [adr] |
| `adr-0039` | adr | `asset:adr-0013` | A structured, schema-validated corpus; markdown as a generated view [adr] |
| `adr-0039` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0039` | adr | `asset:adr-0027` | Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward [adr] |
| `adr-0039` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0039` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0039` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0040` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0040` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0040` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0040` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0040` | adr | `asset:adr-0296` | The world renders no capability-level unhealthy state — withdrawn from the picture, kept in the vocabulary [adr] |
| `adr-0041` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0041` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0041` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0041` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0041` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0041` | adr | `asset:adr-0079` | Possibly-dead presence rows are reaped to done by a sweep [adr] |
| `adr-0042` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0042` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0042` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0042` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0042` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0042` | adr | `asset:adr-0043` | App-owned users, roles, and invitations from the UI [adr] |
| `adr-0043` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0043` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0043` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0044` | adr | `asset:adr-0206` | Rename story-level 'UAT tests' to 'UAT test criteria' [adr] |
| `adr-0044` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0044` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0044` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0045` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0045` | adr | `asset:adr-0041` | Possibly-dead session wisps park in the dock — the world orbits fresh/stale only [adr] |
| `adr-0045` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0045` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0045` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0045` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0045` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0045` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0046` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0046` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0046` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0048` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0048` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0048` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0048` | adr | `asset:adr-0045` | The hosted live-activity layer is signed-verdict blooms; presence stays for multi-dev [adr] |
| `adr-0048` | adr | `asset:adr-0041` | Possibly-dead session wisps park in the dock — the world orbits fresh/stale only [adr] |
| `adr-0048` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0048` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0049` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0049` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0049` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0049` | adr | `asset:adr-0043` | App-owned users, roles, and invitations from the UI [adr] |
| `adr-0049` | adr | `asset:adr-0114` | Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop [adr] |
| `adr-0049` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0050` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0050` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0050` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0050` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0051` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0051` | adr | `asset:adr-0029` | The agent roster is a Library artifact category (`agent` kind) [adr] |
| `adr-0051` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0051` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0051` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0051` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0051` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0052` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0052` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0052` | adr | `asset:adr-0178` | Render delegatable Library agents to native Cursor subagent files [adr] |
| `adr-0052` | adr | `asset:adr-0234` | Render delegatable Library agents to native Gemini CLI subagent files [adr] |
| `adr-0052` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0052` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0052` | adr | `asset:adr-0182` | Delegatable Library agents carry a model tier [adr] |
| `adr-0052` | adr | `asset:adr-0309` | story-author holds a kind-fenced uat-criterion Library write: the atomic pair survives the medium change [adr] |
| `adr-0052` | adr | `asset:adr-0029` | The agent roster is a Library artifact category (`agent` kind) [adr] |
| `adr-0052` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0053` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0053` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0053` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0053` | adr | `asset:adr-0029` | The agent roster is a Library artifact category (`agent` kind) [adr] |
| `adr-0053` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0053` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0054` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0055` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0055` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0055` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0055` | adr | `asset:adr-0053` | CLI builds its guidance prose from the library [adr] |
| `adr-0055` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0055` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0055` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0055` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0055` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0055` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0055` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0056` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0056` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0056` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0056` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0056` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0056` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0056` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0056` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0057` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0057` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0057` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0057` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0057` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0057` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0057` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0057` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0058` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0058` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0059` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0059` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0059` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0059` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0059` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0059` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0059` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0060` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0060` | adr | `asset:adr-0081` | Remove the --store memory opt-out: live and real builds always persist [adr] |
| `adr-0060` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0060` | adr | `asset:adr-0063` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr] |
| `adr-0060` | adr | `asset:adr-0045` | The hosted live-activity layer is signed-verdict blooms; presence stays for multi-dev [adr] |
| `adr-0060` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0060` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0060` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0060` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0061` | adr | `asset:adr-0046` | Continuous deployment for the hosted studio (merge → deploy) [adr] |
| `adr-0061` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0061` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0062` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0062` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0062` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0062` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0063` | adr | `asset:adr-0049` | The hosted studio may wake its own DB (keyless, admin-gated) [adr] |
| `adr-0063` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0063` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0063` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0064` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0064` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0064` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0064` | adr | `asset:adr-0054` | Live-gated tests isolate to a disposable database, fail-closed against production [adr] |
| `adr-0064` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0064` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0064` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0066` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0066` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0066` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0066` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0066` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0066` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0066` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0066` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0066` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0066` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0066` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0066` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0066` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0066` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0067` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0067` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0067` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0067` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0067` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0067` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0067` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0067` | adr | `asset:adr-0131` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr] |
| `adr-0067` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0068` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0068` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0068` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0068` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0068` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0068` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0068` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0068` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0069` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0069` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0069` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0069` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0069` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0069` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0070` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0070` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0070` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0070` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0070` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0070` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0070` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0070` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0070` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0070` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0070` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0070` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0071` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0071` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0072` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0072` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0072` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0072` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0072` | adr | `asset:adr-0073` | Go all-in on roads; retire rivers & ponds [adr] |
| `adr-0072` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0072` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0073` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0073` | adr | `asset:adr-0072` | Forest-world edges: roads, reusing the routing substrate [adr] |
| `adr-0073` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0073` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0073` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0073` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0073` | adr | `asset:adr-0076` | Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities [adr] |
| `adr-0073` | adr | `asset:adr-0169` | Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded) [adr] |
| `adr-0073` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0074` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0074` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0074` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0074` | adr | `asset:adr-0077` | Dissolve the store into library: shared substrate to library, tenant drawers to their organisms [adr] |
| `adr-0074` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0074` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0074` | adr | `asset:adr-0192` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr] |
| `adr-0074` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0074` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0075` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0075` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0075` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0075` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0076` | adr | `asset:adr-0073` | Go all-in on roads; retire rivers & ponds [adr] |
| `adr-0076` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0076` | adr | `asset:adr-0169` | Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded) [adr] |
| `adr-0076` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0076` | adr | `asset:adr-0088` | Building-class stories surface in a permanent Shared Islands left panel [adr] |
| `adr-0076` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0076` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0077` | adr | `asset:adr-0076` | Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities [adr] |
| `adr-0077` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0077` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0077` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0077` | adr | `asset:adr-0075` | Model the shared ports as root organisms (collapse the substrate class) [adr] |
| `adr-0077` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0077` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0077` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0078` | adr | `asset:adr-0075` | Model the shared ports as root organisms (collapse the substrate class) [adr] |
| `adr-0078` | adr | `asset:adr-0077` | Dissolve the store into library: shared substrate to library, tenant drawers to their organisms [adr] |
| `adr-0078` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0078` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0079` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0079` | adr | `asset:adr-0041` | Possibly-dead session wisps park in the dock — the world orbits fresh/stale only [adr] |
| `adr-0079` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0079` | adr | `asset:adr-0141` | Ambient presence heartbeat never resurrects a retired session [adr] |
| `adr-0079` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0079` | adr | `asset:adr-0199` | A build run never writes session presence [adr] |
| `adr-0079` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0080` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0080` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0080` | adr | `asset:adr-0060` | Live and real builds own the database (default --store pg, auto-start Cloud SQL) [adr] |
| `adr-0081` | adr | `asset:adr-0060` | Live and real builds own the database (default --store pg, auto-start Cloud SQL) [adr] |
| `adr-0081` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0081` | adr | `asset:adr-0099` | Synthetic smoke verdicts must not derive a green unit [adr] |
| `adr-0081` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0081` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0082` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0082` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0082` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0082` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0083` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0083` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0083` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0083` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0083` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0083` | adr | `asset:adr-0078` | Rename the two root ports for role, not position (verdict-contract→proof-protocol, base→storage-protocol) [adr] |
| `adr-0083` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0083` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0083` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0083` | adr | `asset:adr-0059` | Gate-as-proof: authoring nodes earn a signed verdict via their structural gate [adr] |
| `adr-0084` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0084` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0084` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0084` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0084` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0084` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0084` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0085` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0085` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0085` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0085` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0085` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0085` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0085` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0086` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0086` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0086` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0086` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0086` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0086` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0086` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0086` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0086` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0086` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0086` | adr | `asset:adr-0014` | The notice board — anchored prose feedback that graduates into durable guidance [adr] |
| `adr-0086` | adr | `asset:adr-0027` | Supersede ADR-0014 — the notice board folds into the Library tier; cite/graduation carried forward [adr] |
| `adr-0086` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0087` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0087` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0087` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0088` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0088` | adr | `asset:adr-0076` | Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities [adr] |
| `adr-0088` | adr | `asset:adr-0228` | Forest map defaults to pathways-only: shared-island hubs return to the map, retire the off-map panel and stamps from the default [adr] |
| `adr-0088` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0088` | adr | `asset:adr-0102` | Shared islands promote their edges to per-island icon stamps (you carry the icon of what you depend on) [adr] |
| `adr-0088` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0088` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0088` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0089` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0089` | adr | `asset:adr-0063` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr] |
| `adr-0089` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0089` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0089` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0089` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0090` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0090` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0090` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0090` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0090` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0090` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0090` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0090` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0091` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0091` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0091` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0091` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0091` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0091` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0092` | adr | `asset:adr-0059` | Gate-as-proof: authoring nodes earn a signed verdict via their structural gate [adr] |
| `adr-0092` | adr | `asset:adr-0087` | Spec-borne write-scope is bounded structurally not by PR-diff review [adr] |
| `adr-0092` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0092` | adr | `asset:adr-0395` | Brown records provenance; proof absence does not invent it [adr] |
| `adr-0092` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0092` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0092` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0092` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0092` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0092` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0092` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0093` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0093` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0093` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0093` | adr | `asset:adr-0299` | The public website shows the real forest as a baked, redacted projection — map and legend only [adr] |
| `adr-0093` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0093` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0093` | adr | `asset:adr-0078` | Rename the two root ports for role, not position (verdict-contract→proof-protocol, base→storage-protocol) [adr] |
| `adr-0093` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0093` | adr | `asset:adr-0075` | Model the shared ports as root organisms (collapse the substrate class) [adr] |
| `adr-0093` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0093` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0093` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0093` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0093` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0093` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0094` | adr | `asset:adr-0092` | Gate-as-proof for a machine-witnessed story's own UAT node [adr] |
| `adr-0094` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0094` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0094` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0094` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0094` | adr | `asset:adr-0395` | Brown records provenance; proof absence does not invent it [adr] |
| `adr-0094` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0094` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0094` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0094` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0094` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0094` | adr | `asset:adr-0087` | Spec-borne write-scope is bounded structurally not by PR-diff review [adr] |
| `adr-0094` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0094` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0095` | adr | `asset:adr-0067` | The inner loop runs a scoped librarian-curator after a green build [adr] |
| `adr-0095` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0095` | adr | `asset:adr-0053` | CLI builds its guidance prose from the library [adr] |
| `adr-0095` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0095` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0095` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0095` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0095` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0095` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0095` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0095` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0095` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0095` | adr | `asset:adr-0323` | Session cost is input-side context rent, not output [adr] |
| `adr-0095` | adr | `asset:adr-0024` | A definition earns its place only if a cold agent can't reconstruct it (the blind-reconstruction test) [adr] |
| `adr-0095` | adr | `asset:adr-0029` | The agent roster is a Library artifact category (`agent` kind) [adr] |
| `adr-0095` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0095` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0095` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0095` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0095` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0095` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0095` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0097` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0097` | adr | `asset:adr-0395` | Brown records provenance; proof absence does not invent it [adr] |
| `adr-0097` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0097` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0097` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0097` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0097` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0097` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0097` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0097` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0097` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0097` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0097` | adr | `asset:adr-0408` | A machine-witnessed acceptance leg carries no human approver; brownfield adoption still does [adr] |
| `adr-0097` | adr | `asset:adr-0098` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr] |
| `adr-0097` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0098` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0098` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0098` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0098` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0098` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0098` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0098` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0099` | adr | `asset:adr-0144` | Chat-accepted node builds run the real proof and persist — the routed node dispatch is node build --real; landing stays the human gate over the parked branch [adr] |
| `adr-0099` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0099` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0099` | adr | `asset:adr-0081` | Remove the --store memory opt-out: live and real builds always persist [adr] |
| `adr-0099` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0099` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0099` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0099` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0099` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0099` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0100` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0100` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0100` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0100` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0100` | adr | `asset:adr-0075` | Model the shared ports as root organisms (collapse the substrate class) [adr] |
| `adr-0100` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0101` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0101` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0101` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0101` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0101` | adr | `asset:adr-0015` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr] |
| `adr-0101` | adr | `asset:adr-0046` | Continuous deployment for the hosted studio (merge → deploy) [adr] |
| `adr-0102` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0102` | adr | `asset:adr-0088` | Building-class stories surface in a permanent Shared Islands left panel [adr] |
| `adr-0102` | adr | `asset:adr-0076` | Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities [adr] |
| `adr-0102` | adr | `asset:adr-0228` | Forest map defaults to pathways-only: shared-island hubs return to the map, retire the off-map panel and stamps from the default [adr] |
| `adr-0102` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0102` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0102` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0102` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0102` | adr | `asset:adr-0169` | Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded) [adr] |
| `adr-0102` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0103` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0103` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0103` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0103` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0103` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0103` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0103` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0103` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0104` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0104` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0104` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0105` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0105` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0105` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0105` | adr | `asset:adr-0098` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr] |
| `adr-0105` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0105` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0105` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0105` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0105` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0105` | adr | `asset:adr-0135` | Retire docs/glossary.md; the Library is the sole term authority [adr] |
| `adr-0105` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0105` | adr | `asset:adr-0099` | Synthetic smoke verdicts must not derive a green unit [adr] |
| `adr-0106` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0106` | adr | `asset:adr-0107` | An open question attached to a proving process gates its green [adr] |
| `adr-0106` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0106` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0106` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0106` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0106` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0106` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0106` | adr | `asset:adr-0098` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr] |
| `adr-0106` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0106` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0106` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0107` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0107` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0107` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0107` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0107` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0107` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0107` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0107` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0107` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0107` | adr | `asset:adr-0083` | Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut [adr] |
| `adr-0108` | adr | `asset:adr-0132` | The desktop chat is orchestrator-first on the smartest model, with a help specialist for newcomers [adr] |
| `adr-0108` | adr | `asset:adr-0131` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr] |
| `adr-0108` | adr | `asset:adr-0152` | Lift the Phase-2 landing wall: the desktop orchestrator runs the merge ceremony, at parity with the terminal session-orchestrator [adr] |
| `adr-0108` | adr | `asset:adr-0155` | Orchestrator drives; retire the chat propose_unit / accept-to-Build affordance [adr] |
| `adr-0108` | adr | `asset:adr-0170` | Chat continuity via SDK session resume [adr] |
| `adr-0108` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0108` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0108` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0108` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0108` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0108` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0108` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0108` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0108` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0108` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0108` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0108` | adr | `asset:adr-0109` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr] |
| `adr-0109` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0109` | adr | `asset:adr-0177` | Open the leaf-runtime seam to Cursor while keeping the deterministic spine [adr] |
| `adr-0109` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0109` | adr | `asset:adr-0179` | Desktop credentials are configurable through the Storytree UI [adr] |
| `adr-0109` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0109` | adr | `asset:adr-0119` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr] |
| `adr-0109` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0109` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0109` | adr | `asset:adr-0001` | Foundational stack — pi + a thin durable orchestrator, no framework [adr] |
| `adr-0109` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0109` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0110` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0110` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0110` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0110` | adr | `asset:adr-0107` | An open question attached to a proving process gates its green [adr] |
| `adr-0110` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0110` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0110` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0110` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0111` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0111` | adr | `asset:adr-0109` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr] |
| `adr-0111` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0111` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0111` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0112` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0112` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0112` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0112` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0112` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0112` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0113` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0113` | adr | `asset:adr-0119` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr] |
| `adr-0113` | adr | `asset:adr-0176` | The desktop app requires a reachable DB and a git checkout to launch — retire the degraded read shell [adr] |
| `adr-0113` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0113` | adr | `asset:adr-0133` | Inner-circle desktop is the priority; the temporary write-broker deferral has ended [adr] |
| `adr-0113` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0113` | adr | `asset:adr-0109` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr] |
| `adr-0113` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0113` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0113` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0113` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0113` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0113` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0113` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0113` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0113` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0113` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0113` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0113` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0114` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0115` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0115` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0115` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0115` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0115` | adr | `asset:adr-0111` | Desktop client Step 1 lands as the apps/desktop surface and stories/desktop story [adr] |
| `adr-0115` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0115` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0115` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0116` | adr | `asset:adr-0118` | Workflow-first CLI surface: proof commands mirror the studio's workflows, primitives nest below [adr] |
| `adr-0116` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0117` | adr | `asset:adr-0133` | Inner-circle desktop is the priority; the temporary write-broker deferral has ended [adr] |
| `adr-0117` | adr | `asset:adr-0180` | Lift the desktop write-broker deferral for brokered UAT signing [adr] |
| `adr-0117` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0117` | adr | `asset:adr-0043` | App-owned users, roles, and invitations from the UI [adr] |
| `adr-0117` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0117` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0117` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0117` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0117` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0117` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0117` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0118` | adr | `asset:adr-0116` | The storytree adopt command surface: adoption actions nest under a first-class adopt area [adr] |
| `adr-0118` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0119` | adr | `asset:adr-0176` | The desktop app requires a reachable DB and a git checkout to launch — retire the degraded read shell [adr] |
| `adr-0119` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0119` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0119` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0119` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0119` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0120` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0120` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0120` | adr | `asset:adr-0135` | Retire docs/glossary.md; the Library is the sole term authority [adr] |
| `adr-0120` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0120` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0120` | adr | `asset:adr-0263` | Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist [adr] |
| `adr-0120` | adr | `asset:adr-0103` | Seed-to-live reconcile for the non-agent corpus tier (sync-corpus) [adr] |
| `adr-0120` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0120` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0120` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0120` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0120` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0120` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0120` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0121` | adr | `asset:adr-0009` | Concurrency, isolation & ID allocation [adr] |
| `adr-0121` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0121` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0121` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0121` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0121` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0121` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0121` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0122` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0122` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0122` | adr | `asset:adr-0127` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr] |
| `adr-0122` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0122` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0122` | adr | `asset:adr-0099` | Synthetic smoke verdicts must not derive a green unit [adr] |
| `adr-0122` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0122` | adr | `asset:adr-0098` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr] |
| `adr-0122` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0123` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0123` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0123` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0123` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0123` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0123` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0123` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0123` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0123` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0123` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0123` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0124` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0124` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0124` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0124` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0124` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0124` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0124` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0124` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0124` | adr | `asset:adr-0119` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr] |
| `adr-0124` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0124` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0124` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0125` | adr | `asset:adr-0135` | Retire docs/glossary.md; the Library is the sole term authority [adr] |
| `adr-0125` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0125` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0125` | adr | `asset:adr-0103` | Seed-to-live reconcile for the non-agent corpus tier (sync-corpus) [adr] |
| `adr-0125` | adr | `asset:adr-0120` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr] |
| `adr-0125` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0125` | adr | `asset:adr-0078` | Rename the two root ports for role, not position (verdict-contract→proof-protocol, base→storage-protocol) [adr] |
| `adr-0125` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0125` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0126` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0126` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0126` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0126` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0126` | adr | `asset:adr-0127` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr] |
| `adr-0126` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0126` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0126` | adr | `asset:adr-0211` | Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate [adr] |
| `adr-0126` | adr | `asset:adr-0249` | Oracle-report freshness: an unattributable observation is not evidence [adr] |
| `adr-0127` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0127` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0127` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0127` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0127` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0127` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0127` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0128` | adr | `asset:adr-0124` | Honest session presence: machine-emitted by the outer-loop runtime, not self-declared [adr] |
| `adr-0128` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0128` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0128` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0128` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0128` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0128` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0128` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0128` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0128` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0128` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0128` | adr | `asset:adr-0119` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr] |
| `adr-0129` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0129` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0129` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0129` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0129` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0130` | adr | `asset:adr-0131` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr] |
| `adr-0130` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0130` | adr | `asset:adr-0005` | Orchestration spine — code sequences, pi judges [adr] |
| `adr-0130` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0130` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0130` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0130` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0130` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0131` | adr | `asset:adr-0151` | Lift the turn cap on the orchestrator session (desktop chat / terminal orchestrate) [adr] |
| `adr-0131` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0131` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0131` | adr | `asset:adr-0132` | The desktop chat is orchestrator-first on the smartest model, with a help specialist for newcomers [adr] |
| `adr-0131` | adr | `asset:adr-0067` | The inner loop runs a scoped librarian-curator after a green build [adr] |
| `adr-0131` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0132` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0132` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0132` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0132` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0132` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0132` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0132` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0132` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0132` | adr | `asset:adr-0004` | Orchestrator/agent boundary [adr] |
| `adr-0132` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0132` | adr | `asset:adr-0129` | Inner-loop adoption target — ratio and goal (open question) [adr] |
| `adr-0133` | adr | `asset:adr-0155` | Orchestrator drives; retire the chat propose_unit / accept-to-Build affordance [adr] |
| `adr-0133` | adr | `asset:adr-0180` | Lift the desktop write-broker deferral for brokered UAT signing [adr] |
| `adr-0133` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0133` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0133` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0133` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0133` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0133` | adr | `asset:adr-0109` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr] |
| `adr-0133` | adr | `asset:adr-0090` | UI-driven orchestration: hosted build-capable backend, thin clients, source server-side [adr] |
| `adr-0133` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0133` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0133` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0134` | adr | `asset:adr-0157` | Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp [adr] |
| `adr-0134` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0134` | adr | `asset:adr-0216` | Act 1 experience: attested overwhelm → finale → transform (frozen) [adr] |
| `adr-0134` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0134` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0134` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0134` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0134` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0134` | adr | `asset:adr-0100` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr] |
| `adr-0134` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0134` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0134` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0134` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0134` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0134` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0134` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0134` | adr | `asset:adr-0172` | Retire the remaining brochure pages: the experience is the entire public site [adr] |
| `adr-0135` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0135` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0135` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0135` | adr | `asset:adr-0120` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr] |
| `adr-0135` | adr | `asset:adr-0125` | Glossary-bearing corpus docs are seed-canonical; reconcile them to live [adr] |
| `adr-0135` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0135` | adr | `asset:adr-0103` | Seed-to-live reconcile for the non-agent corpus tier (sync-corpus) [adr] |
| `adr-0136` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0136` | adr | `asset:adr-0144` | Chat-accepted node builds run the real proof and persist — the routed node dispatch is node build --real; landing stays the human gate over the parked branch [adr] |
| `adr-0137` | adr | `asset:adr-0152` | Lift the Phase-2 landing wall: the desktop orchestrator runs the merge ceremony, at parity with the terminal session-orchestrator [adr] |
| `adr-0137` | adr | `asset:adr-0174` | Interactive builds run in an in-app terminal, not the in-app orchestrator [adr] |
| `adr-0137` | adr | `asset:adr-0144` | Chat-accepted node builds run the real proof and persist — the routed node dispatch is node build --real; landing stays the human gate over the parked branch [adr] |
| `adr-0137` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0137` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0137` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0137` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0137` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0137` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0138` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0138` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0138` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0138` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0138` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0138` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0138` | adr | `asset:adr-0137` | Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write [adr] |
| `adr-0138` | adr | `asset:adr-0124` | Honest session presence: machine-emitted by the outer-loop runtime, not self-declared [adr] |
| `adr-0138` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0138` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0138` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0138` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0138` | adr | `asset:adr-0346` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr] |
| `adr-0138` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0138` | adr | `asset:adr-0212` | One wisp per session: merge the build wisp into the claim lifecycle [adr] |
| `adr-0138` | adr | `asset:adr-0045` | The hosted live-activity layer is signed-verdict blooms; presence stays for multi-dev [adr] |
| `adr-0138` | adr | `asset:adr-0099` | Synthetic smoke verdicts must not derive a green unit [adr] |
| `adr-0138` | adr | `asset:adr-0133` | Inner-circle desktop is the priority; the temporary write-broker deferral has ended [adr] |
| `adr-0139` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0139` | adr | `asset:adr-0006` | Event store & observability surface [adr] |
| `adr-0139` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0139` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0139` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0139` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0139` | adr | `asset:adr-0017` | The cross-cutting knowledge tier (resolves open-q §9) [adr] |
| `adr-0139` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0139` | adr | `asset:adr-0019` | The knowledge tier is named "library"; defer DBOS for its store [adr] |
| `adr-0139` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0139` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0139` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0139` | adr | `asset:adr-0008` | UI drives agents — approval-gated trunk [adr] |
| `adr-0141` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0141` | adr | `asset:adr-0079` | Possibly-dead presence rows are reaped to done by a sweep [adr] |
| `adr-0141` | adr | `asset:adr-0199` | A build run never writes session presence [adr] |
| `adr-0141` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0141` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0141` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0143` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0143` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0143` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0143` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0143` | adr | `asset:adr-0245` | Cross-session signalling addresses the shared primary checkout, not a session [adr] |
| `adr-0144` | adr | `asset:adr-0155` | Orchestrator drives; retire the chat propose_unit / accept-to-Build affordance [adr] |
| `adr-0144` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0144` | adr | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `adr-0145` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0145` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0145` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0145` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0145` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0145` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0145` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0145` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0145` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0145` | adr | `asset:adr-0172` | Retire the remaining brochure pages: the experience is the entire public site [adr] |
| `adr-0145` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0145` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0146` | adr | `asset:adr-0388` | Suggestions-as-proposals is retired on the review surface — direct CriticMarkup editing is the answer [adr] |
| `adr-0148` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0148` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0148` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0148` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0148` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0148` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0148` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0148` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0148` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0149` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0149` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0149` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0149` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0149` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0149` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0149` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0149` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0149` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0150` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0150` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0150` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0150` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0150` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0150` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0150` | adr | `asset:adr-0157` | Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp [adr] |
| `adr-0150` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0150` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0150` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0150` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0150` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0151` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0151` | adr | `asset:adr-0131` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr] |
| `adr-0151` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0151` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0152` | adr | `asset:adr-0137` | Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write [adr] |
| `adr-0152` | adr | `asset:adr-0108` | Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human [adr] |
| `adr-0152` | adr | `asset:adr-0091` | Proof-bearing builds may run in a hosted self-contained worker off the laptop tether [adr] |
| `adr-0152` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0152` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0152` | adr | `asset:adr-0151` | Lift the turn cap on the orchestrator session (desktop chat / terminal orchestrate) [adr] |
| `adr-0152` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0152` | adr | `asset:adr-0144` | Chat-accepted node builds run the real proof and persist — the routed node dispatch is node build --real; landing stays the human gate over the parked branch [adr] |
| `adr-0153` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0153` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0153` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0153` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0153` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0153` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0153` | adr | `asset:adr-0165` | Act 2 redesign: one growing system diagram advanced through the orchestrator chat, a persistent mini-map replacing the corner overlays, an orbiting wisp, and a zoom-out to the real studio [adr] |
| `adr-0153` | adr | `asset:adr-0157` | Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp [adr] |
| `adr-0153` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0153` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0153` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0153` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0153` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0153` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0154` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0154` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0154` | adr | `asset:adr-0161` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr] |
| `adr-0156` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0156` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0156` | adr | `asset:adr-0053` | CLI builds its guidance prose from the library [adr] |
| `adr-0156` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0156` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0156` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0156` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0157` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0157` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0157` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0157` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0157` | adr | `asset:adr-0165` | Act 2 redesign: one growing system diagram advanced through the orchestrator chat, a persistent mini-map replacing the corner overlays, an orbiting wisp, and a zoom-out to the real studio [adr] |
| `adr-0157` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0157` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0157` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0157` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0157` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0157` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0157` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0157` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0159` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0159` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0159` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0159` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0159` | adr | `asset:adr-0105` | Drive and adopt are peer best-efforts: every green is provisional, none is full proof [adr] |
| `adr-0159` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0159` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0159` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0160` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0161` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0161` | adr | `asset:adr-0154` | librarian-curator owns the process tier as a standing projection of the decision log [adr] |
| `adr-0161` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0161` | adr | `asset:adr-0053` | CLI builds its guidance prose from the library [adr] |
| `adr-0161` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0161` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0162` | adr | `asset:adr-0401` | tsx's on-disk transform cache stays off on a long-lived box — the rot reproduces [adr] |
| `adr-0163` | adr | `asset:adr-0174` | Interactive builds run in an in-app terminal, not the in-app orchestrator [adr] |
| `adr-0163` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0164` | adr | `asset:adr-0174` | Interactive builds run in an in-app terminal, not the in-app orchestrator [adr] |
| `adr-0165` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0165` | adr | `asset:adr-0157` | Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp [adr] |
| `adr-0165` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0165` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0165` | adr | `asset:adr-0172` | Retire the remaining brochure pages: the experience is the entire public site [adr] |
| `adr-0165` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0165` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0165` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0165` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0165` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0165` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0165` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0165` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0165` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0165` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0165` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0165` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0166` | adr | `asset:adr-0192` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr] |
| `adr-0167` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0167` | adr | `asset:adr-0172` | Retire the remaining brochure pages: the experience is the entire public site [adr] |
| `adr-0168` | adr | `asset:adr-0032` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr] |
| `adr-0168` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0168` | adr | `asset:adr-0154` | librarian-curator owns the process tier as a standing projection of the decision log [adr] |
| `adr-0168` | adr | `asset:adr-0161` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr] |
| `adr-0168` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0168` | adr | `asset:adr-0287` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr] |
| `adr-0168` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0168` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0168` | adr | `asset:adr-0202` | Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates [adr] |
| `adr-0168` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0168` | adr | `asset:adr-0014` | The notice board — anchored prose feedback that graduates into durable guidance [adr] |
| `adr-0168` | adr | `asset:adr-0024` | A definition earns its place only if a cold agent can't reconstruct it (the blind-reconstruction test) [adr] |
| `adr-0168` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0168` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0168` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0168` | adr | `asset:adr-0143` | Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns [adr] |
| `adr-0168` | adr | `asset:adr-0158` | Glue is un-asserted code within a story; the autonomous chat writes only proof-producing work, un-provable glue is escalated or earns a contract [adr] |
| `adr-0168` | adr | `asset:adr-0162` | Manage session-onboarding cost: optimize the cost centers, then own it with monitoring [adr] |
| `adr-0169` | adr | `asset:adr-0076` | Forest #/tree: docked-line connections (river-trail roads retired) and buildings for foundation utilities [adr] |
| `adr-0169` | adr | `asset:adr-0073` | Go all-in on roads; retire rivers & ponds [adr] |
| `adr-0169` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0169` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0169` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0170` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0171` | adr | `asset:adr-0229` | The default map layout is DAG rows again; the dependency-aware and solar layouts stay in the picker [adr] |
| `adr-0171` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0171` | adr | `asset:adr-0169` | Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded) [adr] |
| `adr-0171` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0172` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0172` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0172` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0172` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0172` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0172` | adr | `asset:adr-0165` | Act 2 redesign: one growing system diagram advanced through the orchestrator chat, a persistent mini-map replacing the corner overlays, an orbiting wisp, and a zoom-out to the real studio [adr] |
| `adr-0172` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0172` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0172` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0172` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0173` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0176` | adr | `asset:adr-0119` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr] |
| `adr-0176` | adr | `asset:adr-0250` | Remote sessions are offline-only: the fence is TLS re-termination, not a port block [adr] |
| `adr-0176` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0176` | adr | `asset:adr-0164` | The desktop app self-restarts to apply a merged fix: the Electron main process is the supervisor, triggered on a git-HEAD advance, never on a merged branch or the running sidecar [adr] |
| `adr-0176` | adr | `asset:adr-0060` | Live and real builds own the database (default --store pg, auto-start Cloud SQL) [adr] |
| `adr-0176` | adr | `asset:adr-0063` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr] |
| `adr-0176` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0176` | adr | `asset:adr-0113` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr] |
| `adr-0176` | adr | `asset:adr-0174` | Interactive builds run in an in-app terminal, not the in-app orchestrator [adr] |
| `adr-0176` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0176` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0176` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0177` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0177` | adr | `asset:adr-0178` | Render delegatable Library agents to native Cursor subagent files [adr] |
| `adr-0177` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0178` | adr | `asset:adr-0234` | Render delegatable Library agents to native Gemini CLI subagent files [adr] |
| `adr-0178` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0178` | adr | `asset:adr-0182` | Delegatable Library agents carry a model tier [adr] |
| `adr-0179` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0179` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0179` | adr | `asset:adr-0109` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr] |
| `adr-0179` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0180` | adr | `asset:adr-0184` | Machine-witness drive-machinery's three live UAT legs [adr] |
| `adr-0182` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0182` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0182` | adr | `asset:adr-0325` | Exploration is delegated to a disposable-context leaf, and every agent is tiered [adr] |
| `adr-0183` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0183` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0183` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0183` | adr | `asset:adr-0250` | Remote sessions are offline-only: the fence is TLS re-termination, not a port block [adr] |
| `adr-0184` | adr | `asset:adr-0180` | Lift the desktop write-broker deferral for brokered UAT signing [adr] |
| `adr-0184` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0184` | adr | `asset:adr-0007` | Proof model [adr] |
| `adr-0184` | adr | `asset:adr-0092` | Gate-as-proof for a machine-witnessed story's own UAT node [adr] |
| `adr-0184` | adr | `asset:adr-0177` | Open the leaf-runtime seam to Cursor while keeping the deterministic spine [adr] |
| `adr-0184` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0184` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0184` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0184` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0184` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0184` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0184` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0184` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0184` | adr | `asset:adr-0057` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr] |
| `adr-0192` | adr | `asset:adr-0369` | The arc domain owns its own package, and the arrow runs arc to drive [adr] |
| `adr-0194` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0194` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0194` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0195` | adr | `asset:adr-0394` | A root path with proven readers narrows the affected scope; every other path still fails wide [adr] |
| `adr-0195` | adr | `asset:adr-0399` | The reader map covers the guidance projections, and a zero-reader path is mapped up rather than to an empty scope [adr] |
| `adr-0196` | adr | `asset:adr-0197` | Lifecycle selector: open by default, one three-state toggle governs shelf, browse, and search [adr] |
| `adr-0196` | adr | `asset:adr-0037` | Decision binding — structured ADR status, story↔ADR edges, and hygiene gates [adr] |
| `adr-0196` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0196` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0196` | adr | `asset:adr-0188` | The library lens is an always-on side panel over a chrome-free full-depth DAG canvas [adr] |
| `adr-0196` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0196` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0196` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0197` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0197` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0197` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0198` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0198` | adr | `asset:adr-0177` | Open the leaf-runtime seam to Cursor while keeping the deterministic spine [adr] |
| `adr-0198` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0198` | adr | `asset:adr-0179` | Desktop credentials are configurable through the Storytree UI [adr] |
| `adr-0198` | adr | `asset:adr-0178` | Render delegatable Library agents to native Cursor subagent files [adr] |
| `adr-0198` | adr | `asset:adr-0184` | Machine-witness drive-machinery's three live UAT legs [adr] |
| `adr-0199` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0199` | adr | `asset:adr-0048` | The in-flight build is the primary wisp — harness-driven, self-cleaning presence [adr] |
| `adr-0199` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0199` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0199` | adr | `asset:adr-0142` | Branch dies on merge; the wisp survives via claim-at-declare [adr] |
| `adr-0199` | adr | `asset:adr-0079` | Possibly-dead presence rows are reaped to done by a sweep [adr] |
| `adr-0199` | adr | `asset:adr-0141` | Ambient presence heartbeat never resurrects a retired session [adr] |
| `adr-0200` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0200` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0200` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0200` | adr | `asset:adr-0142` | Branch dies on merge; the wisp survives via claim-at-declare [adr] |
| `adr-0200` | adr | `asset:adr-0143` | Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns [adr] |
| `adr-0200` | adr | `asset:adr-0199` | A build run never writes session presence [adr] |
| `adr-0200` | adr | `asset:adr-0079` | Possibly-dead presence rows are reaped to done by a sweep [adr] |
| `adr-0200` | adr | `asset:adr-0141` | Ambient presence heartbeat never resurrects a retired session [adr] |
| `adr-0200` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0200` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0200` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0200` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0200` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0200` | adr | `asset:adr-0212` | One wisp per session: merge the build wisp into the claim lifecycle [adr] |
| `adr-0202` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0202` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0202` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0202` | adr | `asset:adr-0301` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr] |
| `adr-0204` | adr | `asset:adr-0205` | One-pathway chrome: the HUD sheds the brand chip and lens shortcuts [adr] |
| `adr-0207` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0209` | adr | `asset:adr-0247` | Retire the model UAT witness tier — the witness split is human or machine [adr] |
| `adr-0209` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0209` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0209` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0209` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0209` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0209` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0209` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0209` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0209` | adr | `asset:adr-0184` | Machine-witness drive-machinery's three live UAT legs [adr] |
| `adr-0210` | adr | `asset:adr-0135` | Retire docs/glossary.md; the Library is the sole term authority [adr] |
| `adr-0210` | adr | `asset:adr-0018` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr] |
| `adr-0210` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0210` | adr | `asset:adr-0120` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr] |
| `adr-0210` | adr | `asset:adr-0026` | Library schema migrations & health checks — per-row version pin, forward-only migrate-on-write, and a gated health module [adr] |
| `adr-0211` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0211` | adr | `asset:adr-0249` | Oracle-report freshness: an unattributable observation is not evidence [adr] |
| `adr-0211` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0211` | adr | `asset:adr-0127` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr] |
| `adr-0211` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0211` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0212` | adr | `asset:adr-0326` | Join a live build to a claim at the claimed unit, not the story [adr] |
| `adr-0212` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0213` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0213` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0213` | adr | `asset:adr-0148` | Act 2 is a website-first walk that grows into an orchestrator-guided forest [adr] |
| `adr-0213` | adr | `asset:adr-0150` | Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage [adr] |
| `adr-0213` | adr | `asset:adr-0153` | Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives [adr] |
| `adr-0213` | adr | `asset:adr-0157` | Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp [adr] |
| `adr-0213` | adr | `asset:adr-0165` | Act 2 redesign: one growing system diagram advanced through the orchestrator chat, a persistent mini-map replacing the corner overlays, an orbiting wisp, and a zoom-out to the real studio [adr] |
| `adr-0213` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0213` | adr | `asset:adr-0216` | Act 1 experience: attested overwhelm → finale → transform (frozen) [adr] |
| `adr-0213` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0213` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0213` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0213` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0213` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0213` | adr | `asset:adr-0058` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr] |
| `adr-0213` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0213` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0213` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0213` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0213` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0214` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0214` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0214` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0214` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0214` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0214` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0214` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0214` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0214` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0215` | adr | `asset:adr-0216` | Act 1 experience: attested overwhelm → finale → transform (frozen) [adr] |
| `adr-0215` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0215` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0215` | adr | `asset:adr-0167` | Info-page triage: the signed disposition set and the Keystatic retirement [adr] |
| `adr-0215` | adr | `asset:adr-0172` | Retire the remaining brochure pages: the experience is the entire public site [adr] |
| `adr-0215` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0215` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0215` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0215` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0215` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0215` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0215` | adr | `asset:adr-0299` | The public website shows the real forest as a baked, redacted projection — map and legend only [adr] |
| `adr-0215` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0215` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0215` | adr | `asset:adr-0101` | Hosted login-protected website content editor — Cloud Run + Keystatic GitHub mode [adr] |
| `adr-0215` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0216` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0216` | adr | `asset:adr-0134` | Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest [adr] |
| `adr-0216` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0216` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0216` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0216` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0216` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0216` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0217` | adr | `asset:adr-0214` | Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap [adr] |
| `adr-0217` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0217` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0217` | adr | `asset:adr-0218` | Baked art carries resolved paint into the shared scene via a fenced node family [adr] |
| `adr-0217` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0217` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0217` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0217` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0218` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0218` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0218` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0218` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0218` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0218` | adr | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `adr-0218` | adr | `asset:adr-0208` | Art-asset designer-swarm: fan out one design subagent per visual asset in a frontend unit [adr] |
| `adr-0219` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0219` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0219` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0219` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0219` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0219` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0219` | adr | `asset:adr-0225` | Generative-3D produces the bridge blocking substrate via a vendor-swappable author-time adapter [adr] |
| `adr-0219` | adr | `asset:adr-0214` | Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap [adr] |
| `adr-0219` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0219` | adr | `asset:adr-0218` | Baked art carries resolved paint into the shared scene via a fenced node family [adr] |
| `adr-0219` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0219` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0219` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0219` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0219` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0219` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0221` | adr | `asset:adr-0218` | Baked art carries resolved paint into the shared scene via a fenced node family [adr] |
| `adr-0221` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0221` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0221` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0222` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0222` | adr | `asset:adr-0218` | Baked art carries resolved paint into the shared scene via a fenced node family [adr] |
| `adr-0222` | adr | `asset:adr-0221` | Autumn-tree hero is the studio garden-flag central tree, resolving ADR-0218's deferred tree call [adr] |
| `adr-0222` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0222` | adr | `asset:adr-0075` | Model the shared ports as root organisms (collapse the substrate class) [adr] |
| `adr-0222` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0222` | adr | `asset:adr-0395` | Brown records provenance; proof absence does not invent it [adr] |
| `adr-0224` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0224` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0224` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0224` | adr | `asset:adr-0222` | Split the art factory into its own story; forest-world gains a capability floor [adr] |
| `adr-0225` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0225` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0225` | adr | `asset:adr-0218` | Baked art carries resolved paint into the shared scene via a fenced node family [adr] |
| `adr-0225` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0225` | adr | `asset:adr-0222` | Split the art factory into its own story; forest-world gains a capability floor [adr] |
| `adr-0225` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0225` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0225` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0228` | adr | `asset:adr-0088` | Building-class stories surface in a permanent Shared Islands left panel [adr] |
| `adr-0228` | adr | `asset:adr-0102` | Shared islands promote their edges to per-island icon stamps (you carry the icon of what you depend on) [adr] |
| `adr-0228` | adr | `asset:adr-0169` | Pathways are procedural trails: cost-field routing, trail merging, and caves (docked-line roads superseded) [adr] |
| `adr-0228` | adr | `asset:adr-0171` | Island placement is dependency-aware: stress-majorization layout with a soft hierarchy anchor [adr] |
| `adr-0228` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0228` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0228` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0229` | adr | `asset:adr-0171` | Island placement is dependency-aware: stress-majorization layout with a soft hierarchy anchor [adr] |
| `adr-0229` | adr | `asset:adr-0228` | Forest map defaults to pathways-only: shared-island hubs return to the map, retire the off-map panel and stamps from the default [adr] |
| `adr-0229` | adr | `asset:adr-0074` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr] |
| `adr-0229` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0229` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0230` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0230` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0230` | adr | `asset:adr-0214` | Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap [adr] |
| `adr-0230` | adr | `asset:adr-0217` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr] |
| `adr-0230` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0230` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0230` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0230` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0230` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0230` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0230` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0231` | adr | `asset:adr-0226` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr] |
| `adr-0231` | adr | `asset:adr-0227` | Baked hero trees carry status via per-status colourways (restore the tree-spread crown hue) [adr] |
| `adr-0231` | adr | `asset:adr-0228` | Forest map defaults to pathways-only: shared-island hubs return to the map, retire the off-map panel and stamps from the default [adr] |
| `adr-0231` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0232` | adr | `asset:adr-0198` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr] |
| `adr-0232` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0232` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0232` | adr | `asset:adr-0356` | Codex promotes only an explicit finite phase target set [adr] |
| `adr-0232` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0232` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0232` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0232` | adr | `asset:adr-0178` | Render delegatable Library agents to native Cursor subagent files [adr] |
| `adr-0233` | adr | `asset:adr-0231` | The vegetation vocabulary is permanent studio world art, not a gear toggle [adr] |
| `adr-0233` | adr | `asset:adr-0036` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr] |
| `adr-0233` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0234` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0235` | adr | `asset:adr-0011` | Own the agent loop and context engineering [adr] |
| `adr-0235` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0235` | adr | `asset:adr-0161` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr] |
| `adr-0235` | adr | `asset:adr-0203` | Per-slice token-usage capture and the token-analytics surface [adr] |
| `adr-0236` | adr | `asset:adr-0238` | Forest flora remains an algorithmically compressed proof-density signal [adr] |
| `adr-0236` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0236` | adr | `asset:adr-0222` | Split the art factory into its own story; forest-world gains a capability floor [adr] |
| `adr-0236` | adr | `asset:adr-0226` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr] |
| `adr-0236` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0236` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0236` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0236` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0237` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0237` | adr | `asset:adr-0213` | Act 2 experience: one continuous orchestrator-led walk [adr] |
| `adr-0237` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0237` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0237` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0237` | adr | `asset:adr-0299` | The public website shows the real forest as a baked, redacted projection — map and legend only [adr] |
| `adr-0237` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0237` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0237` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0237` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0237` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0237` | adr | `asset:adr-0159` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr] |
| `adr-0237` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0238` | adr | `asset:adr-0236` | Forest flora counts observed automated tests, not declared contracts [adr] |
| `adr-0238` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0238` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0238` | adr | `asset:adr-0062` | The forest world is the observability layer rendered: one art element per signal [adr] |
| `adr-0238` | adr | `asset:adr-0222` | Split the art factory into its own story; forest-world gains a capability floor [adr] |
| `adr-0238` | adr | `asset:adr-0226` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr] |
| `adr-0239` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0239` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0239` | adr | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `adr-0239` | adr | `asset:adr-0337` | An agent may reopen a closed arc: arc reopen records why, then flips the bit [adr] |
| `adr-0239` | adr | `asset:adr-0197` | Lifecycle selector: open by default, one three-state toggle governs shelf, browse, and search [adr] |
| `adr-0239` | adr | `asset:adr-0084` | Agents may flip an ADR green [adr] |
| `adr-0239` | adr | `asset:adr-0086` | Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list [adr] |
| `adr-0239` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0240` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0240` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0241` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0241` | adr | `asset:adr-0235` | Record context traversal at deterministic runtime boundaries [adr] |
| `adr-0241` | adr | `asset:adr-0203` | Per-slice token-usage capture and the token-analytics surface [adr] |
| `adr-0241` | adr | `asset:adr-0260` | A followed edge needs an offer it can be joined to, and ordering cannot supply it [adr] |
| `adr-0241` | adr | `asset:adr-0114` | Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop [adr] |
| `adr-0241` | adr | `asset:adr-0162` | Manage session-onboarding cost: optimize the cost centers, then own it with monitoring [adr] |
| `adr-0245` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0245` | adr | `asset:adr-0257` | The write-authority wall is agent-inescapable and binds shared checkouts [adr] |
| `adr-0245` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0245` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0245` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0245` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0245` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0245` | adr | `asset:adr-0143` | Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns [adr] |
| `adr-0245` | adr | `asset:adr-0220` | Self-healing session worktrees: SessionStart repairs the empty-husk branch-at-main failure [adr] |
| `adr-0245` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0245` | adr | `asset:adr-0162` | Manage session-onboarding cost: optimize the cost centers, then own it with monitoring [adr] |
| `adr-0246` | adr | `asset:adr-0261` | Fork (a) settled: fresh-tree authoring is the foreign forest's first user; brownfield mapping becomes its own arc [adr] |
| `adr-0247` | adr | `asset:adr-0295` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr] |
| `adr-0247` | adr | `asset:adr-0209` | Tier model-judged UAT below irreducible human witness [adr] |
| `adr-0247` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0247` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0247` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0247` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0247` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0249` | adr | `asset:adr-0211` | Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate [adr] |
| `adr-0249` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0249` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0250` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0250` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0250` | adr | `asset:adr-0259` | Every client reaches the store through an HTTP front door; direct pg is a server-side privilege [adr] |
| `adr-0250` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0250` | adr | `asset:adr-0063` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr] |
| `adr-0250` | adr | `asset:adr-0042` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr] |
| `adr-0250` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0250` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0251` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0252` | adr | `asset:adr-0269` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr] |
| `adr-0252` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0252` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0252` | adr | `asset:adr-0256` | Deferral-keyed escalation lines are not built: a backstop's trigger must be observable in-run [adr] |
| `adr-0252` | adr | `asset:adr-0301` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr] |
| `adr-0253` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0253` | adr | `asset:adr-0044` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr] |
| `adr-0253` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0253` | adr | `asset:adr-0016` | Knowledge↔code binding & staleness model [adr] |
| `adr-0253` | adr | `asset:adr-0206` | Rename story-level 'UAT tests' to 'UAT test criteria' [adr] |
| `adr-0254` | adr | `asset:adr-0250` | Remote sessions are offline-only: the fence is TLS re-termination, not a port block [adr] |
| `adr-0254` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0254` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0254` | adr | `asset:adr-0021` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr] |
| `adr-0254` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0255` | adr | `asset:adr-0257` | The write-authority wall is agent-inescapable and binds shared checkouts [adr] |
| `adr-0255` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0255` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0255` | adr | `asset:adr-0033` | The notice board is session presence — advisory coordination for parallel sessions [adr] |
| `adr-0255` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0255` | adr | `asset:adr-0143` | Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns [adr] |
| `adr-0255` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0255` | adr | `asset:adr-0245` | Cross-session signalling addresses the shared primary checkout, not a session [adr] |
| `adr-0255` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0255` | adr | `asset:adr-0142` | Branch dies on merge; the wisp survives via claim-at-declare [adr] |
| `adr-0255` | adr | `asset:adr-0212` | One wisp per session: merge the build wisp into the claim lifecycle [adr] |
| `adr-0256` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0256` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0257` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0257` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0257` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0257` | adr | `asset:adr-0245` | Cross-session signalling addresses the shared primary checkout, not a session [adr] |
| `adr-0257` | adr | `asset:adr-0355` | Interactive Codex writes only in its current claimed worktree [adr] |
| `adr-0257` | adr | `asset:adr-0258` | The inner loop is separable from the store: remote sessions lack the Cloud SQL connector, not database access [adr] |
| `adr-0257` | adr | `asset:adr-0259` | Every client reaches the store through an HTTP front door; direct pg is a server-side privilege [adr] |
| `adr-0257` | adr | `asset:adr-0114` | Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop [adr] |
| `adr-0257` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0257` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0257` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0258` | adr | `asset:adr-0250` | Remote sessions are offline-only: the fence is TLS re-termination, not a port block [adr] |
| `adr-0258` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0258` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0258` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0258` | adr | `asset:adr-0259` | Every client reaches the store through an HTTP front door; direct pg is a server-side privilege [adr] |
| `adr-0258` | adr | `asset:adr-0254` | A non-human identity may hold library write scope; proof-bearing writes stay human-tethered [adr] |
| `adr-0258` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0258` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0259` | adr | `asset:adr-0117` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr] |
| `adr-0259` | adr | `asset:adr-0246` | Forests for other projects: the ADR-0133 deferral is lifted and scoped as its own arc [adr] |
| `adr-0259` | adr | `asset:adr-0244` | Distribution posture: ship the method, protect the stream — reputation and velocity are the moat, not code secrecy [adr] |
| `adr-0259` | adr | `asset:adr-0258` | The inner loop is separable from the store: remote sessions lack the Cloud SQL connector, not database access [adr] |
| `adr-0259` | adr | `asset:adr-0352` | a --set edit writes only the fields it names [adr] |
| `adr-0259` | adr | `asset:adr-0064` | Widen the inner-loop proof envelope: DB-backed proofs, spine-driven dependency adds, and the visual-proof boundary [adr] |
| `adr-0259` | adr | `asset:adr-0089` | Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop [adr] |
| `adr-0259` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0260` | adr | `asset:adr-0312` | The doc: blind spot is measured, not closed: an offer set states how much of itself the telemetry cannot see [adr] |
| `adr-0260` | adr | `asset:adr-0320` | Following a Library pointer means pasting the offered form: the decision tree's thinness is guidance debt [adr] |
| `adr-0260` | adr | `asset:adr-0318` | Membership is the agreement that matters: the offer-set order divergence is pinned, not repaired [adr] |
| `adr-0262` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0262` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0262` | adr | `asset:adr-0127` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr] |
| `adr-0263` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0263` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0263` | adr | `asset:adr-0120` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr] |
| `adr-0263` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0263` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0263` | adr | `asset:adr-0095` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr] |
| `adr-0263` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0263` | adr | `asset:adr-0210` | Retire the generated apps/studio/data/assets.json [adr] |
| `adr-0264` | adr | `asset:adr-0273` | PixelLab island growth is a selective standard shared-app sprite track [adr] |
| `adr-0264` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0264` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0264` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0264` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0264` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0265` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0265` | adr | `asset:adr-0211` | Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate [adr] |
| `adr-0265` | adr | `asset:adr-0262` | Contract clauses are declared but not observable: check:coverage stays name-granular until a clause carries identity [adr] |
| `adr-0265` | adr | `asset:adr-0126` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr] |
| `adr-0265` | adr | `asset:adr-0249` | Oracle-report freshness: an unattributable observation is not evidence [adr] |
| `adr-0265` | adr | `asset:adr-0098` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr] |
| `adr-0265` | adr | `asset:adr-0068` | Make the organism model physical: real story isolation and the farmer owns the proof ruler [adr] |
| `adr-0265` | adr | `asset:adr-0127` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr] |
| `adr-0266` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0266` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0266` | adr | `asset:adr-0154` | librarian-curator owns the process tier as a standing projection of the decision log [adr] |
| `adr-0266` | adr | `asset:adr-0161` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr] |
| `adr-0266` | adr | `asset:adr-0096` | Render mermaid diagrams in the studio markdown surface [adr] |
| `adr-0266` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0266` | adr | `asset:adr-0251` | Mirror conformance: two surfaces required to agree are gated by a test that compares them [adr] |
| `adr-0266` | adr | `asset:adr-0263` | Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist [adr] |
| `adr-0266` | adr | `asset:adr-0128` | The bare forest map is honest by absence; inner-loop adoption is the gap [adr] |
| `adr-0267` | adr | `asset:adr-0314` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr] |
| `adr-0267` | adr | `asset:adr-0299` | The public website shows the real forest as a baked, redacted projection — map and legend only [adr] |
| `adr-0267` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0267` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0267` | adr | `asset:adr-0185` | Library as a tech-tree overlay on the forest map [adr] |
| `adr-0267` | adr | `asset:adr-0191` | Library lens defaults to a top drawer handle; lens state is URL-derived; full-width top-third layout [adr] |
| `adr-0267` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0267` | adr | `asset:adr-0204` | Retire the studio banner: full-bleed forest with a HUD avatar on the verified identity [adr] |
| `adr-0267` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0267` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0269` | adr | `asset:adr-0034` | `process` artifacts — ways-of-working as a downstream library kind [adr] |
| `adr-0269` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0269` | adr | `asset:adr-0251` | Mirror conformance: two surfaces required to agree are gated by a test that compares them [adr] |
| `adr-0269` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0269` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0270` | adr | `asset:adr-0346` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr] |
| `adr-0270` | adr | `asset:adr-0308` | Increments form a DAG and carry their own claim set: depends_on for order, cites for the fence [adr] |
| `adr-0270` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0270` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0270` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0270` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0270` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0272` | adr | `asset:adr-0240` | Studio map responsiveness — cache and defer before cutting density [adr] |
| `adr-0272` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0272` | adr | `asset:adr-0238` | Forest flora remains an algorithmically compressed proof-density signal [adr] |
| `adr-0273` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0273` | adr | `asset:adr-0264` | Chapter 2 tree growth uses one deterministic topology rig with art as replaceable finish [adr] |
| `adr-0273` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0273` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0273` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0273` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0274` | adr | `asset:adr-0273` | PixelLab island growth is a selective standard shared-app sprite track [adr] |
| `adr-0274` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0274` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0274` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0274` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0274` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0274` | adr | `asset:adr-0367` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr] |
| `adr-0274` | adr | `asset:adr-0293` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr] |
| `adr-0274` | adr | `asset:adr-0277` | Occlusion-registered cutouts are retained for small plants, not the hero tree [adr] |
| `adr-0274` | adr | `asset:adr-0264` | Chapter 2 tree growth uses one deterministic topology rig with art as replaceable finish [adr] |
| `adr-0274` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0276` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr0276-latent-poll-cap-class-has-its-first-confirmed-flake` | friction | `doc:decisions/0276-wall-clock-timing-leaves-the-gate-tier.md` | Wall-clock timing leaves the gate tier [adr, now `adr-0276`] |
| `adr0276-latent-poll-cap-class-has-its-first-confirmed-flake` | friction | `node:desktop` | _(a work-tree node — story or capability)_ |
| `adr-0277` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0277` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0277` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0277` | adr | `asset:adr-0273` | PixelLab island growth is a selective standard shared-app sprite track [adr] |
| `adr-0277` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0277` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0277` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0277` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0278` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0278` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0278` | adr | `asset:adr-0269` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr] |
| `adr-0278` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0278` | adr | `asset:adr-0257` | The write-authority wall is agent-inescapable and binds shared checkouts [adr] |
| `adr-0278` | adr | `asset:adr-0301` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr] |
| `adr-0280` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0280` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0280` | adr | `asset:adr-0367` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr] |
| `adr-0280` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0280` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0280` | adr | `asset:adr-0277` | Occlusion-registered cutouts are retained for small plants, not the hero tree [adr] |
| `adr-0280` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0280` | adr | `asset:adr-0264` | Chapter 2 tree growth uses one deterministic topology rig with art as replaceable finish [adr] |
| `adr-0280` | adr | `asset:adr-0273` | PixelLab island growth is a selective standard shared-app sprite track [adr] |
| `adr-0280` | adr | `asset:adr-0214` | Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap [adr] |
| `adr-0280` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0280` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0282` | adr | `asset:adr-0367` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr] |
| `adr-0282` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0282` | adr | `asset:adr-0283` | Act 2 growth follows the edge: pathways grow from settled nodes, and one layout [adr] |
| `adr-0282` | adr | `asset:adr-0285` | An island forms the moment a pathway reaches it, not when all its ground has settled [adr] |
| `adr-0282` | adr | `asset:adr-0286` | The forest regrows on first arrival each session, paced by a world-settings dial [adr] |
| `adr-0282` | adr | `asset:adr-0299` | The public website shows the real forest as a baked, redacted projection — map and legend only [adr] |
| `adr-0282` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0282` | adr | `asset:adr-0277` | Occlusion-registered cutouts are retained for small plants, not the hero tree [adr] |
| `adr-0282` | adr | `asset:adr-0264` | Chapter 2 tree growth uses one deterministic topology rig with art as replaceable finish [adr] |
| `adr-0282` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0282` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0282` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0283` | adr | `asset:adr-0285` | An island forms the moment a pathway reaches it, not when all its ground has settled [adr] |
| `adr-0283` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0283` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0283` | adr | `asset:adr-0229` | The default map layout is DAG rows again; the dependency-aware and solar layouts stay in the picker [adr] |
| `adr-0283` | adr | `asset:adr-0171` | Island placement is dependency-aware: stress-majorization layout with a soft hierarchy anchor [adr] |
| `adr-0283` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0283` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0284` | adr | `asset:adr-0257` | The write-authority wall is agent-inescapable and binds shared checkouts [adr] |
| `adr-0284` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0284` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0284` | adr | `asset:adr-0245` | Cross-session signalling addresses the shared primary checkout, not a session [adr] |
| `adr-0284` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0284` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0285` | adr | `asset:adr-0283` | Act 2 growth follows the edge: pathways grow from settled nodes, and one layout [adr] |
| `adr-0285` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0285` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0286` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0286` | adr | `asset:adr-0283` | Act 2 growth follows the edge: pathways grow from settled nodes, and one layout [adr] |
| `adr-0286` | adr | `asset:adr-0285` | An island forms the moment a pathway reaches it, not when all its ground has settled [adr] |
| `adr-0286` | adr | `asset:adr-0240` | Studio map responsiveness — cache and defer before cutting density [adr] |
| `adr-0286` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0287` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0287` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0287` | adr | `asset:adr-0290` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr] |
| `adr-0289` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0289` | adr | `asset:adr-0293` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr] |
| `adr-0289` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0289` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0290` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0290` | adr | `asset:adr-0301` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr] |
| `adr-0290` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0290` | adr | `asset:adr-0120` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr] |
| `adr-0290` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0290` | adr | `asset:adr-0263` | Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist [adr] |
| `adr-0290` | adr | `asset:adr-0269` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr] |
| `adr-0290` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0290` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0290` | adr | `asset:adr-0246` | Forests for other projects: the ADR-0133 deferral is lifted and scoped as its own arc [adr] |
| `adr-0291` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0291` | adr | `asset:adr-0051` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr] |
| `adr-0291` | adr | `asset:adr-0052` | Render delegatable agents to harness-native subagent files [adr] |
| `adr-0291` | adr | `asset:adr-0162` | Manage session-onboarding cost: optimize the cost centers, then own it with monitoring [adr] |
| `adr-0292` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0292` | adr | `asset:adr-0283` | Act 2 growth follows the edge: pathways grow from settled nodes, and one layout [adr] |
| `adr-0292` | adr | `asset:adr-0285` | An island forms the moment a pathway reaches it, not when all its ground has settled [adr] |
| `adr-0292` | adr | `asset:adr-0286` | The forest regrows on first arrival each session, paced by a world-settings dial [adr] |
| `adr-0292` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0292` | adr | `asset:adr-0277` | Occlusion-registered cutouts are retained for small plants, not the hero tree [adr] |
| `adr-0292` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0292` | adr | `asset:adr-0289` | The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement [adr] |
| `adr-0292` | adr | `asset:adr-0226` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr] |
| `adr-0292` | adr | `asset:adr-0227` | Baked hero trees carry status via per-status colourways (restore the tree-spread crown hue) [adr] |
| `adr-0292` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0292` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0293` | adr | `asset:adr-0289` | The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement [adr] |
| `adr-0293` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0293` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0293` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0294` | adr | `asset:adr-0348` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr] |
| `adr-0294` | adr | `asset:adr-0010` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr] |
| `adr-0294` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0294` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0294` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0294` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0294` | adr | `asset:adr-0253` | Criterion identity is immutable across UAT revisions [adr] |
| `adr-0294` | adr | `asset:adr-0295` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr] |
| `adr-0294` | adr | `asset:adr-0122` | Per-contract coverage check: map each declared contract to an observed test [adr] |
| `adr-0294` | adr | `asset:adr-0353` | A capability declares where its contract tests live, separately from what its build may write [adr] |
| `adr-0295` | adr | `asset:adr-0247` | Retire the model UAT witness tier — the witness split is human or machine [adr] |
| `adr-0295` | adr | `asset:adr-0348` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr] |
| `adr-0295` | adr | `asset:adr-0357` | Human UAT witness also covers surfaces no harness owns — every human leg states its basis [adr] |
| `adr-0295` | adr | `asset:adr-0209` | Tier model-judged UAT below irreducible human witness [adr] |
| `adr-0295` | adr | `asset:adr-0294` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr] |
| `adr-0295` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0295` | adr | `asset:adr-0184` | Machine-witness drive-machinery's three live UAT legs [adr] |
| `adr-0295` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0296` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0296` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0296` | adr | `asset:adr-0226` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr] |
| `adr-0296` | adr | `asset:adr-0227` | Baked hero trees carry status via per-status colourways (restore the tree-spread crown hue) [adr] |
| `adr-0296` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0296` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0297` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0297` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0297` | adr | `asset:adr-0287` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr] |
| `adr-0297` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0297` | adr | `asset:adr-0290` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr] |
| `adr-0298` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0298` | adr | `asset:adr-0377` | Arc folding defaults to a new arc; folding requires surface ownership [adr] |
| `adr-0298` | adr | `asset:adr-0382` | The 20-increment arc cap is withdrawn; placement discipline replaces it [adr] |
| `adr-0298` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0298` | adr | `asset:adr-0287` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr] |
| `adr-0298` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0298` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0298` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0298` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0298` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0298` | adr | `asset:adr-0271` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr] |
| `adr-0298` | adr | `asset:adr-0269` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr] |
| `adr-0298` | adr | `asset:adr-0130` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr] |
| `adr-0299` | adr | `asset:adr-0215` | Public website story frame: two-act experience is the entire site [adr] |
| `adr-0299` | adr | `asset:adr-0237` | Chapter 2 is a scripted mode of the real app — share product UI, art and semantic motion [adr] |
| `adr-0299` | adr | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `adr-0299` | adr | `asset:adr-0056` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr] |
| `adr-0299` | adr | `asset:adr-0066` | Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic [adr] |
| `adr-0299` | adr | `asset:adr-0259` | Every client reaches the store through an HTTP front door; direct pg is a server-side privilege [adr] |
| `adr-0299` | adr | `asset:adr-0282` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr] |
| `adr-0299` | adr | `asset:adr-0114` | Hosted DB sleeps on a fixed 1am-7am Sydney window, replacing idle-aware auto-stop [adr] |
| `adr-0301` | adr | `asset:adr-0290` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr] |
| `adr-0301` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0301` | adr | `asset:adr-0269` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr] |
| `adr-0301` | adr | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `adr-0301` | adr | `asset:adr-0202` | Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates [adr] |
| `adr-0301` | adr | `asset:adr-0278` | A fifth verification-decay instrument: an injected seam whose default no test exercises [adr] |
| `adr-0301` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0302` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0304` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0305` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0305` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0305` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0305` | adr | `asset:adr-0196` | Unified artifact lifecycle: open, active, archived [adr] |
| `adr-0305` | adr | `asset:adr-0306` | Typed work-hierarchy refs: increments cite stories and capabilities as resolvable pointers [adr] |
| `adr-0306` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0306` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0306` | adr | `asset:adr-0002` | The work hierarchy — story, capability, contract [adr] |
| `adr-0306` | adr | `asset:adr-0029` | The agent roster is a Library artifact category (`agent` kind) [adr] |
| `adr-0307` | adr | `asset:adr-0055` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr] |
| `adr-0307` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0307` | adr | `asset:adr-0209` | Tier model-judged UAT below irreducible human witness [adr] |
| `adr-0307` | adr | `asset:adr-0247` | Retire the model UAT witness tier — the witness split is human or machine [adr] |
| `adr-0307` | adr | `asset:adr-0023` | Agents reach the Library through an exploratory, just-in-time CLI [adr] |
| `adr-0307` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0308` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0308` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0308` | adr | `asset:adr-0306` | Typed work-hierarchy refs: increments cite stories and capabilities as resolvable pointers [adr] |
| `adr-0308` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0308` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0308` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0309` | adr | `asset:adr-0209` | Tier model-judged UAT below irreducible human witness [adr] |
| `adr-0309` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0309` | adr | `asset:adr-0175` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr] |
| `adr-0309` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0309` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0309` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0311` | adr | `asset:adr-0372` | check:ownership-totality earns its blocking rung, clearing ADR-0317 D2's bar [adr] |
| `adr-0311` | adr | `asset:adr-0403` | The decision log becomes ordinary artifacts in Postgres, and open-sourcing is deferred [adr] |
| `adr-0313` | adr | `asset:adr-0272` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr] |
| `adr-0313` | adr | `asset:adr-0286` | The forest regrows on first arrival each session, paced by a world-settings dial [adr] |
| `adr-0313` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0314` | adr | `asset:adr-0279` | A corpus-mandated ceremony that only an agent's discretion enforces is not mandated: make the librarian pass observable, and resolve the harness conflict at the owner's layer [adr] |
| `adr-0314` | adr | `asset:adr-0267` | Arcs take the map's primary top-drawer slot, the Library becomes secondary [adr] |
| `adr-0314` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0314` | adr | `asset:adr-0306` | Typed work-hierarchy refs: increments cite stories and capabilities as resolvable pointers [adr] |
| `adr-0314` | adr | `asset:adr-0308` | Increments form a DAG and carry their own claim set: depends_on for order, cites for the fence [adr] |
| `adr-0314` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0314` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0314` | adr | `asset:adr-0349` | The floor-health readout is a small always-visible lamp on the map, not a band inside the arc drawer [adr] |
| `adr-0315` | adr | `asset:adr-0031` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr] |
| `adr-0315` | adr | `asset:adr-0020` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr] |
| `adr-0315` | adr | `asset:adr-0022` | CI green gate + auto-merge-on-green (inside free Actions) [adr] |
| `adr-0317` | adr | `asset:adr-0372` | check:ownership-totality earns its blocking rung, clearing ADR-0317 D2's bar [adr] |
| `adr-0321` | adr | `asset:adr-0030` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr] |
| `adr-0321` | adr | `asset:adr-0232` | Add a ChatGPT-subscription Codex prove-it leaf [adr] |
| `adr-0321` | adr | `asset:adr-0291` | Render the canonical session orchestrator into Codex root guidance [adr] |
| `adr-0322` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0322` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0322` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0322` | adr | `asset:adr-0271` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr] |
| `adr-0326` | adr | `asset:adr-0212` | One wisp per session: merge the build wisp into the claim lifecycle [adr] |
| `adr-0326` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0326` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0326` | adr | `asset:adr-0121` | Per-unit write-claim refuses a second concurrent build of one unit [adr] |
| `adr-0326` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0331` | adr | `asset:adr-0323` | Session cost is input-side context rent, not output [adr] |
| `adr-0331` | adr | `asset:adr-0325` | Exploration is delegated to a disposable-context leaf, and every agent is tiered [adr] |
| `adr-0331` | adr | `asset:adr-0330` | The eagerly-loaded guidance surface is budgeted at 96 KiB, reported not gated [adr] |
| `adr-0332` | adr | `asset:adr-0334` | Plan-lane width is planned for, not discovered; the fan-out arc reopens [adr] |
| `adr-0332` | adr | `asset:adr-0344` | Live fan-out clears the bar on both axes, and the binding constraint is still width [adr] |
| `adr-0332` | adr | `asset:adr-0340` | Lane width is real, and gated on shared registries rather than on the planner's brief [adr] |
| `adr-0333` | adr | `asset:adr-0334` | Plan-lane width is planned for, not discovered; the fan-out arc reopens [adr] |
| `adr-0334` | adr | `asset:adr-0341` | The registry door is a quarter as wide as it looked, and only one surface is worth opening [adr] |
| `adr-0334` | adr | `asset:adr-0340` | Lane width is real, and gated on shared registries rather than on the planner's brief [adr] |
| `adr-0334` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0335` | adr | `asset:adr-0337` | An agent may reopen a closed arc: arc reopen records why, then flips the bit [adr] |
| `adr-0335` | adr | `asset:adr-0347` | arc close refuses over open increments: draining the work is the closing act [adr] |
| `adr-0335` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0335` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0335` | adr | `asset:adr-0267` | Arcs take the map's primary top-drawer slot, the Library becomes secondary [adr] |
| `adr-0335` | adr | `asset:adr-0314` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr] |
| `adr-0337` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0337` | adr | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `adr-0338` | adr | `asset:adr-0358` | Arc and open-question truth-maintenance: owner picks 1B + 2D + 2E + 2B, 7-day lease [adr] |
| `adr-0338` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0338` | adr | `asset:adr-0279` | A corpus-mandated ceremony that only an agent's discretion enforces is not mandated: make the librarian pass observable, and resolve the harness conflict at the owner's layer [adr] |
| `adr-0338` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0338` | adr | `asset:adr-0202` | Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates [adr] |
| `adr-0338` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0338` | adr | `asset:adr-0182` | Delegatable Library agents carry a model tier [adr] |
| `adr-0338` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0338` | adr | `asset:adr-0314` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr] |
| `adr-0339` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0339` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0339` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0339` | adr | `asset:adr-0304` | The gate measures what a change affects, and the queue does the rebasing [adr] |
| `adr-0339` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0340` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0341` | adr | `asset:adr-0343` | The CLI command register is one capability, and stays one unit [adr] |
| `adr-0341` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0341` | adr | `asset:adr-0342` | Decomposing the CLI dispatcher cannot buy its measured width, and the registry path is exhausted [adr] |
| `adr-0342` | adr | `asset:adr-0343` | The CLI command register is one capability, and stays one unit [adr] |
| `adr-0342` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0344` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0344` | adr | `asset:adr-0345` | The landing tail is one CI job, its biggest step is read amplification, and it need not be serial [adr] |
| `adr-0345` | adr | `asset:adr-0362` | The merge queue is declined on measurement, and the fan-out arc's forward test closes unread [adr] |
| `adr-0346` | adr | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `adr-0346` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0346` | adr | `asset:adr-0138` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr] |
| `adr-0346` | adr | `asset:adr-0308` | Increments form a DAG and carry their own claim set: depends_on for order, cites for the fence [adr] |
| `adr-0346` | adr | `asset:adr-0303` | An escalation is a landing event: a blocked session lands its state and releases its claims [adr] |
| `adr-0346` | adr | `asset:adr-0329` | A small unit is driven in-thread, not cut into a fresh session [adr] |
| `adr-0347` | adr | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `adr-0347` | adr | `asset:adr-0337` | An agent may reopen a closed arc: arc reopen records why, then flips the bit [adr] |
| `adr-0347` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0347` | adr | `asset:adr-0334` | Plan-lane width is planned for, not discovered; the fan-out arc reopens [adr] |
| `adr-0347` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0347` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0348` | adr | `asset:adr-0295` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr] |
| `adr-0348` | adr | `asset:adr-0294` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr] |
| `adr-0348` | adr | `asset:adr-0357` | Human UAT witness also covers surfaces no harness owns — every human leg states its basis [adr] |
| `adr-0348` | adr | `asset:adr-0184` | Machine-witness drive-machinery's three live UAT legs [adr] |
| `adr-0348` | adr | `asset:adr-0247` | Retire the model UAT witness tier — the witness split is human or machine [adr] |
| `adr-0348` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0348` | adr | `asset:adr-0106` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr] |
| `adr-0353` | adr | `asset:adr-0294` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr] |
| `adr-0355` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0355` | adr | `asset:adr-0368` | The claim broker holds the credential the sandbox may not, and derives identity Git cannot be lied to about [adr] |
| `adr-0355` | adr | `asset:adr-0364` | Codex write authority is a standing worktrees grant narrowed by the live claim [adr] |
| `adr-0357` | adr | `asset:adr-0396` | A retired story's UAT criteria are deleted with their ordinals burned — the body keeps the history, the criteria keep no obligation [adr] |
| `adr-0358` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0358` | adr | `asset:adr-0338` | Arc and open-question truth-maintenance: reactive trigger extension plus an explored staleness fork [adr] |
| `adr-0358` | adr | `asset:adr-0324` | The librarian pass is trigger-gated and split, not per-landing [adr] |
| `adr-0358` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0358` | adr | `asset:adr-0202` | Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates [adr] |
| `adr-0358` | adr | `asset:adr-0182` | Delegatable Library agents carry a model tier [adr] |
| `adr-0358` | adr | `asset:adr-0384` | The increment lifecycle's middle states get a write path [adr] |
| `adr-0358` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0358` | adr | `asset:adr-0314` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr] |
| `adr-0359` | adr | `asset:adr-0314` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr] |
| `adr-0359` | adr | `asset:adr-0351` | The arc lane state stops implying a session it cannot see: `running` becomes `moving`, and `claimed` is a positive-only ledger join [adr] |
| `adr-0359` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0359` | adr | `asset:adr-0096` | Render mermaid diagrams in the studio markdown surface [adr] |
| `adr-0364` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0367` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0367` | adr | `asset:adr-0274` | PixelLab animates organic growth over the app-owned SVG island [adr] |
| `adr-0367` | adr | `asset:adr-0380` | The runtime target is desktop-class hardware with a GPU, and the land may render live [adr] |
| `adr-0367` | adr | `asset:adr-0406` | The experiment island represents nothing, so props, materials and colour are unfenced on it [adr] |
| `adr-0367` | adr | `asset:adr-0289` | The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement [adr] |
| `adr-0367` | adr | `asset:adr-0293` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr] |
| `adr-0368` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0369` | adr | `asset:adr-0192` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr] |
| `adr-0369` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0369` | adr | `asset:adr-0267` | Arcs take the map's primary top-drawer slot, the Library becomes secondary [adr] |
| `adr-0369` | adr | `asset:adr-0112` | Extract the build/orchestrate drivers into packages/drive [adr] |
| `adr-0369` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0372` | adr | `asset:adr-0317` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr] |
| `adr-0372` | adr | `asset:adr-0336` | Re-wire the Act 1 static-import-closure check as a new, narrower gate rung [adr] |
| `adr-0372` | adr | `asset:adr-0311` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr] |
| `adr-0372` | adr | `asset:adr-0301` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr] |
| `adr-0372` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0372` | adr | `asset:adr-0278` | A fifth verification-decay instrument: an injected seam whose default no test exercises [adr] |
| `adr-0375` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0375` | adr | `asset:adr-0379` | The desktop hosts the Codex claim authority whenever the boundary is installed [adr] |
| `adr-0377` | adr | `asset:adr-0382` | The 20-increment arc cap is withdrawn; placement discipline replaces it [adr] |
| `adr-0377` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0378` | adr | `asset:adr-0060` | Live and real builds own the database (default --store pg, auto-start Cloud SQL) [adr] |
| `adr-0378` | adr | `asset:adr-0081` | Remove the --store memory opt-out: live and real builds always persist [adr] |
| `adr-0378` | adr | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `adr-0379` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0379` | adr | `asset:adr-0375` | The resident claim authority lives in the desktop app, and the managed hook reads through it [adr] |
| `adr-0379` | adr | `asset:adr-0368` | The claim broker holds the credential the sandbox may not, and derives identity Git cannot be lied to about [adr] |
| `adr-0379` | adr | `asset:adr-0364` | Codex write authority is a standing worktrees grant narrowed by the live claim [adr] |
| `adr-0380` | adr | `asset:adr-0069` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr] |
| `adr-0380` | adr | `asset:adr-0367` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr] |
| `adr-0380` | adr | `asset:adr-0280` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr] |
| `adr-0380` | adr | `asset:adr-0219` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr] |
| `adr-0380` | adr | `asset:adr-0230` | Swappable sprite art-sheet render mode: take ADR-0219's parked raster fork for the studio map, prototype-scoped and default-off [adr] |
| `adr-0380` | adr | `asset:adr-0214` | Ground AI-authored art in a physical model: CSG over SVG, not a render-substrate swap [adr] |
| `adr-0380` | adr | `asset:adr-0145` | Act 2 walks the real 2.5D map — the R3F forest retreats to far-future [adr] |
| `adr-0381` | adr | `asset:adr-0390` | Codex runs at Claude parity and the managed containment boundary is withdrawn [adr] |
| `adr-0381` | adr | `asset:adr-0364` | Codex write authority is a standing worktrees grant narrowed by the live claim [adr] |
| `adr-0381` | adr | `asset:adr-0355` | Interactive Codex writes only in its current claimed worktree [adr] |
| `adr-0381` | adr | `asset:adr-0375` | The resident claim authority lives in the desktop app, and the managed hook reads through it [adr] |
| `adr-0381` | adr | `asset:adr-0379` | The desktop hosts the Codex claim authority whenever the boundary is installed [adr] |
| `adr-0381` | adr | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `adr-0382` | adr | `asset:adr-0377` | Arc folding defaults to a new arc; folding requires surface ownership [adr] |
| `adr-0382` | adr | `asset:adr-0298` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr] |
| `adr-0382` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0382` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0383` | adr | `asset:adr-0288` | Not worth a session is a first-class outcome: restore discretion at the closing leg [adr] |
| `adr-0383` | adr | `asset:adr-0271` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr] |
| `adr-0383` | adr | `asset:adr-0359` | The arc briefing panel is a review queue, not a log [adr] |
| `adr-0383` | adr | `asset:adr-0156` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr] |
| `adr-0383` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0384` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0384` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0384` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0384` | adr | `asset:adr-0358` | Arc and open-question truth-maintenance: owner picks 1B + 2D + 2E + 2B, 7-day lease [adr] |
| `adr-0384` | adr | `asset:adr-0352` | a --set edit writes only the fields it names [adr] |
| `adr-0384` | adr | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `adr-0384` | adr | `asset:adr-0386` | The increment's active flip rides the notice-board claim [adr] |
| `adr-0384` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0386` | adr | `asset:adr-0384` | The increment lifecycle's middle states get a write path [adr] |
| `adr-0386` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0386` | adr | `asset:adr-0239` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr] |
| `adr-0386` | adr | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `adr-0386` | adr | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `adr-0386` | adr | `asset:adr-0305` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr] |
| `adr-0386` | adr | `asset:adr-0142` | Branch dies on merge; the wisp survives via claim-at-declare [adr] |
| `adr-0386` | adr | `asset:adr-0200` | The noticeboard is the claim ledger — forced session claims, presence retired [adr] |
| `adr-0394` | adr | `asset:adr-0195` | Affected-only PR test scope: CI cost scales with the change, not the repo [adr] |
| `adr-0394` | adr | `asset:adr-0304` | The gate measures what a change affects, and the queue does the rebasing [adr] |
| `adr-0395` | adr | `asset:adr-0038` | Story-world vocabulary recalibration — growth carries the lifecycle [adr] |
| `adr-0395` | adr | `asset:adr-0040` | Proof paints the world — verdict-derived green and the human-witness signpost [adr] |
| `adr-0395` | adr | `asset:adr-0092` | Gate-as-proof for a machine-witnessed story's own UAT node [adr] |
| `adr-0395` | adr | `asset:adr-0094` | Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred [adr] |
| `adr-0395` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0395` | adr | `asset:adr-0296` | The world renders no capability-level unhealthy state — withdrawn from the picture, kept in the vocabulary [adr] |
| `adr-0396` | adr | `asset:adr-0294` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr] |
| `adr-0396` | adr | `asset:adr-0348` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr] |
| `adr-0396` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0396` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0396` | adr | `asset:adr-0085` | Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign [adr] |
| `adr-0396` | adr | `asset:adr-0357` | Human UAT witness also covers surfaces no harness owns — every human leg states its basis [adr] |
| `adr-0403` | adr | `asset:adr-0302` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr] |
| `adr-0403` | adr | `asset:adr-0307` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr] |
| `adr-0403` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0403` | adr | `asset:adr-0223` | The knowledge DAG is an authored standsOn edge, not the citation web [adr] |
| `adr-0403` | adr | `asset:adr-0402` | The knowledge DAG edge is renamed dependsOn; amends keeps its name [adr] |
| `adr-0403` | adr | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-0403` | adr | `asset:adr-0361` | The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write [adr] |
| `adr-0403` | adr | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `adr-0403` | adr | `asset:adr-0257` | The write-authority wall is agent-inescapable and binds shared checkouts [adr] |
| `adr-0405` | adr | `asset:adr-0408` | A machine-witnessed acceptance leg carries no human approver; brownfield adoption still does [adr] |
| `adr-0405` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0408` | adr | `asset:adr-0405` | The machine-UAT signing mechanism exists — UAT needs its own surface [adr] |
| `adr-0408` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0408` | adr | `asset:adr-0097` | Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped [adr] |
| `adr-0408` | adr | `asset:adr-0082` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr] |
| `adr-0408` | adr | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `adr-0409` | adr | `asset:adr-0110` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr] |
| `adr-0409` | adr | `asset:adr-0348` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr] |
| `adr-0409` | adr | `asset:adr-0357` | Human UAT witness also covers surfaces no harness owns — every human leg states its basis [adr] |
| `adr-0409` | adr | `asset:adr-0405` | The machine-UAT signing mechanism exists — UAT needs its own surface [adr] |
| `adr-0409` | adr | `asset:adr-0408` | A machine-witnessed acceptance leg carries no human approver; brownfield adoption still does [adr] |
| `adr-0409` | adr | `asset:adr-0070` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr] |
| `adr-0471` | adr | `asset:adr-0292` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr] |
| `adr-0471` | adr | `asset:adr-0367` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr] |
| `adr-0471` | adr | `asset:frontend-visual-judgment-arc` | The frontend agent judges a visual surface on its own two feet [arc] |
| `adr-0471` | adr | `asset:frontend-appearance-repair-arc` | The forest map is legible again, and the instruments that judge it are honest [arc] |
| `adr-0471` | adr | `asset:grow-tell-roam-ask` | Grow · Tell · Roam · Ask — the four movements of chapter 2 [definition] |
| `adr-0471` | adr | `asset:website-refresh-arc` | The website refresh: the real forest carries the pitch [arc] |
| `adr-awaiting-an-owner-signature-looks-exactly-like-an-unfinished-draft` | friction | `asset:not-built-in-a-source-header-reads-as-pending-work` | A decision NOT to build, recorded only in a source header, reads as pending work [friction] |
| `adr-decided-retirement-code-still-mounted` | friction | `node:headless-orchestrator` | _(a work-tree node — story or capability)_ |
| `adr-decided-retirement-code-still-mounted` | friction | `doc:decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr, now `adr-0175`] |
| `adr-decided-retirement-code-still-mounted` | friction | `doc:decisions/0163-mature-the-desktop-in-app-orchestrator-by-dogfooding-claude.md` | Mature the desktop in-app orchestrator by dogfooding: Claude Code routes real work through it and chips the gaps, never bypassing [adr, now `adr-0163`] |
| `adr-next-burns-the-number-it-says-it-holds` | friction | `asset:adr-0050` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr] |
| `adr-prescribed-build-address-outlived-by-later-infrastructure-adr` | friction | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `adr-prescribed-build-address-outlived-by-later-infrastructure-adr` | friction | `node:library-dag-acyclic-corpus-gate` | _(a work-tree node — story or capability)_ |
| `a-durable-fact-was-recorded-in-a-generated-file` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `advertise-only-mounted-capabilities` | pattern | `asset:uat-proves-the-goal-not-the-surface` | UAT proves the goal, not the surface [principle] |
| `advertise-only-mounted-capabilities` | pattern | `asset:observability-first` | Observability-first [principle] |
| `advertise-only-mounted-capabilities` | pattern | `doc:decisions/0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr, now `adr-0119`] |
| `advertise-only-mounted-capabilities` | pattern | `doc:decisions/0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md` | Thick-local desktop for the inner circle — the drive machinery runs on the trusted member's machine [adr, now `adr-0113`] |
| `a-failed-cd-runs-the-rest-of-a-bash-block-in-the-parent-repo` | friction | `asset:adr-0255` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr] |
| `a-failed-cd-runs-the-rest-of-a-bash-block-in-the-parent-repo` | friction | `asset:adr-0284` | The write-authority wall stays static; worktree-to-worktree isolation is de-scoped [adr] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:an-awaited-notification-is-not-a-turn-ending-state` | An awaited notification is never a turn-ending state [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:state-the-principle-not-the-mechanics` | State the principle, not the mechanics [principle] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `a-fan-out-result-does-not-report-its-own-completeness` | principle | `asset:durable-workflow-per-node` | One durable workflow per node [pattern] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:a-probe-cannot-falsify-the-predicate-it-borrows` | A probe cannot falsify the predicate it borrows [principle] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:an-inherited-precondition-holds-only-where-and-when-it-was-authored` | An inherited precondition holds only where and when it was authored [principle] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `a-fence-names-the-premise-not-a-proxy` | principle | `node:render-claim-as-wisp` | _(a work-tree node — story or capability)_ |
| `affected-pr-test-scope` | process | `doc:decisions/0195-affected-only-pr-test-scope-ci-cost-scales-with-the-change-n.md` | Affected-only PR test scope: CI cost scales with the change, not the repo [adr, now `adr-0195`] |
| `affected-pr-test-scope` | process | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `affected-pr-test-scope` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `affected-pr-test-scope` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `affected-pr-test-scope` | process | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-fields-rendered-shape-does-not-tell-you-its-stored-type` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `a-finding-count-published-without-the-findings` | friction | `asset:pull-the-four-land-colours-apart-in-hue` | Pull the four land status colours apart in hue [increment] |
| `a-finding-count-published-without-the-findings` | friction | `asset:adr-0470` | The land's brown is a tilled clay, and the vocabulary now clears its own floor [adr] |
| `a-fixture-outlives-the-producer-it-was-copied-from` | friction | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `a-fixture-outlives-the-producer-it-was-copied-from` | friction | `asset:adr-0403` | The decision log becomes ordinary artifacts in Postgres, and open-sourcing is deferred [adr] |
| `a-fixture-outlives-the-producer-it-was-copied-from` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `a-foreign-dev-server-answers-200-on-the-port-you-picked` | friction | `doc:decisions/0245-cross-session-signalling-addresses-the-shared-primary-checko.md` | Cross-session signalling addresses the shared primary checkout, not a session [adr, now `adr-0245`] |
| `a-formula-replicated-in-another-packages-fixture-drifts-silently` | friction | `asset:adr-0251` | Mirror conformance: two surfaces required to agree are gated by a test that compares them [adr] |
| `a-formula-replicated-in-another-packages-fixture-drifts-silently` | friction | `asset:summary-type-mirrored-in-studio-fold-with-no-mechanical-link` | A required field added to a traversal summary type breaks a hand-mirrored studio fold that no check pairs with it [friction] |
| `a-formula-replicated-in-another-packages-fixture-drifts-silently` | friction | `asset:studio-island-layout-moves-to-ground-space` | The studio's own island layout moves to ground space [increment] |
| `a-gate-check-that-walks-the-live-docs-tree-reds-on-any-concurrent-write` | friction | `node:cli` | _(a work-tree node — story or capability)_ |
| `a-gate-check-that-walks-the-live-docs-tree-reds-on-any-concurrent-write` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-gate-rung-and-its-surface-can-read-one-substrate-by-different-routes` | friction | `asset:standson-studio-projection` | Directional DAG - the studio renders the authored edge [increment] |
| `a-gate-rung-and-its-surface-can-read-one-substrate-by-different-routes` | friction | `asset:standson-depth-join-and-increment-wire` | Directional DAG - unblock the depth-from-work join by fixing the increment wire [increment] |
| `a-gate-rung-and-its-surface-can-read-one-substrate-by-different-routes` | friction | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `a-generated-floor-rule-can-prescribe-a-verb-that-does-not-exist` | friction | `asset:librarian-curator` | librarian-curator [agent] |
| `a-generated-floor-rule-can-prescribe-a-verb-that-does-not-exist` | friction | `asset:session-orchestrator` | session-orchestrator [agent] |
| `a-generated-floor-rule-can-prescribe-a-verb-that-does-not-exist` | friction | `doc:decisions/0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr, now `adr-0307`] |
| `agent-artifact-asserts-a-retired-runtime-fence` | friction | `doc:decisions/0309-story-author-holds-a-kind-fenced-uat-criterion-library-write.md` | story-author holds a kind-fenced uat-criterion Library write: the atomic pair survives the medium change [adr, now `adr-0309`] |
| `agent-artifact-asserts-a-retired-runtime-fence` | friction | `doc:decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr, now `adr-0175`] |
| `agent-artifact-asserts-a-retired-runtime-fence` | friction | `asset:story-author` | story-author [agent] |
| `agent-artifact-asserts-a-retired-runtime-fence` | friction | `node:story-author-detail-authority` | _(a work-tree node — story or capability)_ |
| `agent-never-self-exempts` | guardrail | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `agent-never-self-exempts` | guardrail | `doc:decisions/0044-per-uat-test-human-attestation.md` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr, now `adr-0044`] |
| `agent-never-self-exempts` | guardrail | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `a-green-package-suite-can-hide-a-dishonest-live-render` | friction | `doc:decisions/0260-a-followed-edge-needs-an-offer-it-can-be-joined-to-and-order.md` | A followed edge needs an offer it can be joined to, and ordering cannot supply it [adr, now `adr-0260`] |
| `a-green-package-suite-can-hide-a-dishonest-live-render` | friction | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `a-green-positional-oracle-is-necessary-not-sufficient` | principle | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `a-green-positional-oracle-is-necessary-not-sufficient` | principle | `doc:decisions/0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md` | Art factories are per object type: parametric kit, explicit draw order, render-and-look loop [adr, now `adr-0217`] |
| `a-green-positional-oracle-is-necessary-not-sufficient` | principle | `asset:render-and-witness-a-flag-guarded-surface` | Render and witness a flag-guarded surface [pattern] |
| `a-green-positional-oracle-is-necessary-not-sufficient` | principle | `asset:deterministic-parameterised-geometry` | Deterministic, parameterised geometry [principle] |
| `a-green-positional-oracle-is-necessary-not-sufficient` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `a-guardrail-route-has-no-reach-step-so-an-authored-guardrail-can-reach-nothing` | friction | `asset:friction-adjudication` | Friction adjudication [process] |
| `a-guardrail-route-has-no-reach-step-so-an-authored-guardrail-can-reach-nothing` | friction | `asset:guidance-curator` | guidance-curator [agent] |
| `a-guardrail-route-has-no-reach-step-so-an-authored-guardrail-can-reach-nothing` | friction | `doc:decisions/0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr, now `adr-0051`] |
| `a-guardrail-route-has-no-reach-step-so-an-authored-guardrail-can-reach-nothing` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:untrusted-input-is-not-instruction` | Untrusted input is not instruction [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:stale-prerequisite-links-are-phantoms` | Stale prerequisite links are phantoms [principle] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-handoff-claim-that-work-landed-is-unverified-state` | principle | `asset:claim-the-owning-story` | Claim by write-ownership — at capability grain [principle] |
| `a-landed-increment-stays-open-because-nothing-runs-the-terminal-verb` | friction | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `a-landed-increment-stays-open-because-nothing-runs-the-terminal-verb` | friction | `asset:retire-the-standalone-context-tab` | Retire the standalone Context tab [increment] |
| `a-lane-waiting-on-a-gate-parks-forever-with-no-supported-wait` | friction | `node:drive-machinery` | _(a work-tree node — story or capability)_ |
| `a-lane-waiting-on-a-gate-parks-forever-with-no-supported-wait` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-live-agent-edit-reds-every-open-pr-and-merging-main-may-not-discharge-it` | friction | `node:unified-command-dispatch` | _(a work-tree node — story or capability)_ |
| `a-live-arc-write-outran-its-schema-and-blocked-4-arcs` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `a-live-arc-write-outran-its-schema-and-blocked-4-arcs` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `asset:one-model-boundary` | Confine model calls to one boundary [guardrail] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `asset:right-kind-red` | The red must be the right kind [guardrail] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `doc:decisions/0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md` | Synthetic smoke verdicts must not derive a green unit [adr, now `adr-0099`] |
| `a-live-only-guarantee-is-an-honesty-gap` | principle | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `all-or-nothing-export-carries-a-foreign-citation-to-an-unlanded-adr-into-the-seed` | friction | `doc:decisions/0050-adr-number-allocation.md` | ADR numbers are allocated from the store (no more parallel-authoring collisions) [adr, now `adr-0050`] |
| `all-or-nothing-export-carries-a-foreign-citation-to-an-unlanded-adr-into-the-seed` | friction | `doc:decisions/0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr, now `adr-0120`] |
| `all-or-nothing-export-carries-a-foreign-citation-to-an-unlanded-adr-into-the-seed` | friction | `doc:decisions/0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md` | Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist [adr, now `adr-0263`] |
| `all-or-nothing-export-carries-a-foreign-citation-to-an-unlanded-adr-into-the-seed` | friction | `asset:live-to-seed-drain-is-all-or-nothing-so-its-ceiling-cannot-reach-zero` | The live-to-seed drain is all-or-nothing, so the backlog it drains cannot be bounded at zero [friction] |
| `a-measured-claim-carries-its-method` | pattern | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `a-measured-claim-carries-its-method` | pattern | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `a-measured-claim-carries-its-method` | pattern | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `a-measured-claim-carries-its-method` | pattern | `asset:citing-a-document-is-not-reading-it` | Citing a document is not reading it [principle] |
| `a-measured-claim-carries-its-method` | pattern | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `a-measured-claim-carries-its-method` | pattern | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `a-measured-claim-carries-its-method` | pattern | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `a-measured-claim-carries-its-method` | pattern | `asset:measure-session-cost-from-transcripts` | Measure session cost from harness transcripts [process] |
| `a-measured-claim-carries-its-method` | pattern | `doc:decisions/0358-arc-and-open-question-truth-maintenance-owner-picks-1b-2d-2e.md` | Arc and open-question truth-maintenance: owner picks 1B + 2D + 2E + 2B, 7-day lease [adr, now `adr-0358`] |
| `a-measured-claim-carries-its-method` | pattern | `doc:decisions/0338-arc-and-open-question-truth-maintenance-reactive-trigger-ext.md` | Arc and open-question truth-maintenance: reactive trigger extension plus an explored staleness fork [adr, now `adr-0338`] |
| `a-memory-stamped-a-pr-number-on-work-that-was-still-in-flight` | friction | `asset:render-depends-on-from-the-field` | Render depends_on from the field as the onward edge [increment] |
| `a-memory-stamped-a-pr-number-on-work-that-was-still-in-flight` | friction | `asset:adr-0464` | Retire the citation-derived offer surface: search and depends_on become the discovery route [adr] |
| `amending-adr-leaves-its-target-hand-annotated-and-unchecked` | friction | `asset:canonical-design-artifact-has-no-gate-so-prose-tracks-its-drift` | A canonical design artifact has no gate, so its own prose has to track the drift [friction] |
| `a-mid-gate-test-flake-silently-skips-every-later-gate-check` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:a-live-only-guarantee-is-an-honesty-gap` | A live-only-provable guarantee is an honesty gap [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:a-green-positional-oracle-is-necessary-not-sufficient` | A green positional oracle is necessary, not sufficient [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `a-mocked-seam-leaves-its-default-implementation-unproven` | principle | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `an-adr-bearing-branch-forfeits-scope-narrowing-and-pays-the-flakiest-gate` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `an-adr-fence-named-a-proxy-not-its-premise` | friction | `node:render-claim-as-wisp` | _(a work-tree node — story or capability)_ |
| `an-adr-that-quotes-what-it-rejected-reads-as-still-asserting-it` | friction | `doc:decisions/0392-the-owner-attests-once-the-island-is-whole-agents-make-the-a.md` | The owner attests once the island is whole; agents make the art calls until then [adr, now `adr-0392`] |
| `an-advisory-list-stays-readable-or-stops-being-advisory` | guardrail | `asset:signal-and-noise` | Signal and noise [principle] |
| `an-advisory-list-stays-readable-or-stops-being-advisory` | guardrail | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `an-advisory-list-stays-readable-or-stops-being-advisory` | guardrail | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `an-advisory-list-stays-readable-or-stops-being-advisory` | guardrail | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `an-amending-adr-can-land-outside-the-load-bearing-calibration-set` | friction | `node:unified-command-dispatch` | _(a work-tree node — story or capability)_ |
| `an-amending-adr-can-land-outside-the-load-bearing-calibration-set` | friction | `doc:decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr, now `adr-0271`] |
| `an-amending-adr-can-land-outside-the-load-bearing-calibration-set` | friction | `doc:decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md` | Branch dies on merge; the wisp survives via claim-at-declare [adr, now `adr-0142`] |
| `an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | guardrail | `asset:prove-it-gate` | Prove-it gate [principle] |
| `an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | guardrail | `asset:test-creation-principles` | Test creation principles [principle] |
| `an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | guardrail | `doc:decisions/0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md` | Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate [adr, now `adr-0211`] |
| `an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | guardrail | `doc:decisions/0249-oracle-report-freshness-an-unattributable-observation-is-not.md` | Oracle-report freshness: an unattributable observation is not evidence [adr, now `adr-0249`] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `doc:decisions/0301-drain-ceilings-charge-by-authorship-verification-decay-and-g.md` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr, now `adr-0301`] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `doc:decisions/0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr, now `adr-0290`] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `doc:decisions/0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr, now `adr-0269`] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `asset:fail-closed-conditions-never-share-a-measure` | Independent fail-closed conditions never share a measure [pattern] |
| `an-authorship-exclusion-follows-its-remedy` | pattern | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:a-fan-out-result-does-not-report-its-own-completeness` | A fan-out result does not report its own completeness [principle] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:in-session-subagent` | in-session subagent [definition] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:state-the-principle-not-the-mechanics` | State the principle, not the mechanics [principle] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `an-awaited-notification-is-not-a-turn-ending-state` | principle | `asset:subagent-context-pull` | Subagent context pull [process] |
| `anchor-implementation-surface` | principle | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `anchor-implementation-surface` | principle | `doc:decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr, now `adr-0139`] |
| `anchor-implementation-surface` | principle | `asset:plan` | Plan [definition] |
| `anchor-implementation-surface` | principle | `asset:arc` | Arc [definition] |
| `anchor-implementation-surface` | principle | `asset:an-owner-approved-reference-is-repo-resident` | An owner-approved reference is repo-resident [principle] |
| `an-emitter-built-to-remove-transcription-still-needed-hand-correction` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `an-emitter-built-to-remove-transcription-still-needed-hand-correction` | friction | `node:pixellab-organic-growth-tracks` | _(a work-tree node — story or capability)_ |
| `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist` | friction | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist` | friction | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `an-empty-env-var-from-a-shell-escape-reads-as-db-unreachable` | friction | `doc:decisions/0021-keyless-agent-session-auth-and-db-bootstrap.md` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr, now `adr-0021`] |
| `a-new-metric-drove-the-work-before-it-was-robust` | friction | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `a-new-write-path-opts-out-of-an-attribution-convention-silently` | friction | `doc:decisions/0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md` | The corpus-content ceiling measures what the branch authored, not what the shared store holds [adr, now `adr-0290`] |
| `a-new-write-path-opts-out-of-an-attribution-convention-silently` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `a-new-write-path-opts-out-of-an-attribution-convention-silently` | friction | `node:library-cli` | _(a work-tree node — story or capability)_ |
| `an-increment-logs-forward-looking-claim-rots-into-false-state` | friction | `asset:worktree-reaper-integrity-arc` | Worktree reaper integrity — a drain that cannot silently no-op [arc] |
| `an-increment-logs-forward-looking-claim-rots-into-false-state` | friction | `asset:mocked-seam-exempts-its-default-impl-from-proof` | An injected IO seam left its own default implementation with zero coverage, so a fully green suite proved nothing about the code that actually ran [friction] |
| `an-increment-logs-forward-looking-claim-rots-into-false-state` | friction | `asset:a-mocked-seam-leaves-its-default-implementation-unproven` | A mocked seam leaves its default implementation unproven [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:a-mocked-seam-leaves-its-default-implementation-unproven` | A mocked seam leaves its default implementation unproven [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:the-same-file-in-another-tree-is-a-different-file` | The same file in another tree is a different file [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:right-kind-red` | The red must be the right kind [guardrail] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:pin-the-dual-runtime-import-form` | The published surface is not evidence of runtime shape -- probe, then pin [pattern] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `an-inherited-precondition-holds-only-where-and-when-it-was-authored` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:a-green-positional-oracle-is-necessary-not-sufficient` | A green positional oracle is necessary, not sufficient [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:fail-closed-conditions-never-share-a-measure` | Independent fail-closed conditions never share a measure [pattern] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:an-unattributable-observation-is-not-evidence` | An unattributable observation is not evidence [guardrail] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | An assert-oracle proof that cannot fail is not a proof [guardrail] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:an-inherited-precondition-holds-only-where-and-when-it-was-authored` | An inherited precondition holds only where and when it was authored [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:trace-the-defect-to-its-producing-stage-before-building` | Trace a defect to its producing stage before building against it [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:price-the-deferral` | Price the deferral [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `doc:decisions/0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md` | Studio map responsiveness — cache and defer before cutting density [adr, now `adr-0240`] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `an-observable-is-evidence-only-for-what-it-observes` | principle | `doc:decisions/0286-the-forest-regrows-on-first-arrival-each-session-paced-by-a.md` | The forest regrows on first arrival each session, paced by a world-settings dial [adr, now `adr-0286`] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:arc` | Arc [definition] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:repo-surface-allowlist` | Repo surface allow-list [guardrail] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:render-and-witness-a-flag-guarded-surface` | Render and witness a flag-guarded surface [pattern] |
| `an-owner-approved-reference-is-repo-resident` | principle | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `an-owner-approved-reference-is-repo-resident` | principle | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `answered-open-question-has-no-discoverable-drain-verb` | friction | `asset:first-class-edges-arc` | The pathways between story nodes are first-class, addressable, claimable objects [arc] |
| `an-unattributable-observation-is-not-evidence` | guardrail | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `an-unattributable-observation-is-not-evidence` | guardrail | `asset:verification-wins` | verification-wins [principle] |
| `an-unattributable-observation-is-not-evidence` | guardrail | `doc:decisions/0249-oracle-report-freshness-an-unattributable-observation-is-not.md` | Oracle-report freshness: an unattributable observation is not evidence [adr, now `adr-0249`] |
| `an-unmeasured-cost-recorded-as-a-design-fork-propagates-as-fact` | friction | `doc:decisions/0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md` | The write-authority wall is agent-inescapable and binds shared checkouts [adr, now `adr-0257`] |
| `a-parked-arc-entry-can-never-be-edited-or-removed` | friction | `asset:arcs-hold-increments-arc` | Arcs hold increments [arc] |
| `a-parked-entrys-comparative-steers-target-choice` | friction | `asset:capability-layer-coverage-arc` | The capability layer covers what sessions write, or says why not [arc] |
| `a-parked-entrys-comparative-steers-target-choice` | friction | `asset:capability-layer-coverage-arc-inc-06` | Increment 6 — the arc organ, taken whole. [increment] |
| `a-parked-entrys-comparative-steers-target-choice` | friction | `asset:capability-layer-coverage-arc-inc-05` | Increment 5 — the `cli` story, and the last untried run of the rule-(5) falsifier. [increment] |
| `a-parked-entrys-comparative-steers-target-choice` | friction | `asset:a-parked-entrys-premise-can-be-overtaken-with-no-freshness-check` | A parked entry's premise can be overtaken, and nothing checks it [friction] |
| `a-parked-entrys-premise-can-be-overtaken-with-no-freshness-check` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `a-parked-increment-restates-its-friction-items-cause-as-settled-scope` | friction | `asset:guidance-write-path-integrity-arc` | Guidance write-path integrity — a successful-looking edit cannot silently corrupt the harness [arc] |
| `a-parked-increment-restates-its-friction-items-cause-as-settled-scope` | friction | `asset:long-field-writes-land-whole-or-fail` | A long-field write lands whole or fails loudly [increment] |
| `a-parked-increment-restates-its-friction-items-cause-as-settled-scope` | friction | `asset:regen-mid-edit-truncates-guidance-silently` | Regenerating a guidance projection while a sibling edits the artifact truncates it silently [friction] |
| `a-parked-increment-restates-its-friction-items-cause-as-settled-scope` | friction | `doc:decisions/0361-the-guidance-write-path-proves-its-own-fidelity-a-trusted-ch.md` | The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write [adr, now `adr-0361`] |
| `a-per-package-timing-below-the-boxs-noise-floor-is-recorded-as-a-finding` | friction | `doc:research/bun-runtime-probe-2026-08-22.md` | _(a repo path, not a library row)_ |
| `a-per-package-timing-below-the-boxs-noise-floor-is-recorded-as-a-finding` | friction | `asset:bun-runtime-migration-arc` | Bun becomes the runtime, one package at a time [arc] |
| `approval` | definition | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `approval` | definition | `asset:gate` | gate [definition] |
| `approval` | definition | `asset:approval-event-promotion-event` | approval event / promotion event [definition] |
| `approval` | definition | `asset:approval-gated-trunk` | Approval-gated trunk [guardrail] |
| `approval` | definition | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `approval-event-promotion-event` | definition | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `approval-event-promotion-event` | definition | `asset:event` | event [definition] |
| `approval-event-promotion-event` | definition | `asset:approval` | approval [definition] |
| `approval-event-promotion-event` | definition | `asset:steering` | steering [definition] |
| `approval-event-promotion-event` | definition | `asset:trunk` | trunk [definition] |
| `approval-gated-trunk` | guardrail | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `approval-gated-trunk` | guardrail | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `approval-gated-trunk` | guardrail | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `a-pre-run-idle-probe-does-not-prove-the-run-was-clean` | friction | `doc:decisions/0286-the-forest-regrows-on-first-arrival-each-session-paced-by-a.md` | The forest regrows on first arrival each session, paced by a world-settings dial [adr, now `adr-0286`] |
| `a-pre-run-idle-probe-does-not-prove-the-run-was-clean` | friction | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:two-surfaces-required-to-agree-are-gated` | Two surfaces required to agree are gated [guardrail] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | An assert-oracle proof that cannot fail is not a proof [guardrail] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:desktop-e2e-conventions` | Desktop E2E conventions [process] |
| `a-probe-cannot-falsify-the-predicate-it-borrows` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `a-process-list-on-a-shared-dev-box-carries-no-session-ownership` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `arc` | definition | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `arc` | definition | `asset:plan` | Plan [definition] |
| `arc` | definition | `asset:story` | story [definition] |
| `arc` | definition | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `arc` | definition | `asset:an-owner-approved-reference-is-repo-resident` | An owner-approved reference is repo-resident [principle] |
| `arc` | definition | `asset:a-deferral-recorded-without-a-status-reads-as-pending-work` | A deferral recorded without a status reads as pending work [principle] |
| `arc` | definition | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `arc-closed-on-an-adr-delivery-gate-that-never-ran` | friction | `asset:codex-factory-parity-arc` | Codex factory parity [arc] |
| `arc-intent-can-go-false-with-nothing-detecting-it` | friction | `doc:research/codex-onboarding-journey-survey-2026-08-22.md` | _(a repo path, not a library row)_ |
| `arc-narrative-fields-have-no-staleness-signal` | friction | `doc:decisions/0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr, now `adr-0335`] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:arc` | Arc [definition] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:calibrate-ceremony-to-stakes` | Calibrate ceremony to stakes [principle] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:a-deferral-recorded-without-a-status-reads-as-pending-work` | A deferral recorded without a status reads as pending work [principle] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:price-the-deferral` | Price the deferral [principle] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:adr-0455` | An arc is not minted, or kept open, for a single deferred owner-witness signature [adr] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:adr-0288` | Not worth a session is a first-class outcome: restore discretion at the closing leg [adr] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:adr-0335` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:adr-0337` | An agent may reopen a closed arc: arc reopen records why, then flips the bit [adr] |
| `arc-not-minted-for-deferred-owner-signature` | principle | `asset:adr-0007` | Proof model [adr] |
| `arc-orientation-surface-arc` | arc | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `arc-orientation-surface-arc` | arc | `doc:decisions/0204-retire-the-studio-banner-full-bleed-forest-with-a-hud-avatar.md` | Retire the studio banner: full-bleed forest with a HUD avatar on the verified identity [adr, now `adr-0204`] |
| `arc-orientation-surface-arc` | arc | `doc:decisions/0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md` | Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list [adr, now `adr-0239`] |
| `arc-parked-work-renders-behind-the-whole-history` | friction | `asset:arc` | Arc [definition] |
| `arc-parked-work-renders-behind-the-whole-history` | friction | `asset:arcs-hold-increments-arc` | Arcs hold increments [arc] |
| `arc-proposal-body-fields-never-render-in-arc-show` | friction | `asset:arc` | Arc [definition] |
| `arc-proposal-body-fields-never-render-in-arc-show` | friction | `asset:plan` | Plan [definition] |
| `arc-proposal-body-fields-never-render-in-arc-show` | friction | `asset:arcs-hold-increments-arc` | Arcs hold increments [arc] |
| `arcs-and-plans-arc` | arc | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `arcs-and-plans-arc` | arc | `asset:arc` | Arc [definition] |
| `arcs-and-plans-arc` | arc | `asset:plan` | Plan [definition] |
| `arcs-and-plans-arc` | arc | `asset:planner` | planner [agent] |
| `arcs-and-plans-arc` | arc | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `arc-show-has-no-narrower-view-than-the-whole-arc` | friction | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `arc-show-has-no-narrower-view-than-the-whole-arc` | friction | `doc:decisions/0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr, now `adr-0298`] |
| `arc-show-has-no-narrower-view-than-the-whole-arc` | friction | `asset:arcs-hold-increments-arc` | Arcs hold increments [arc] |
| `a-read-write-round-trip-captures-the-tools-own-banner` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `a-read-write-round-trip-captures-the-tools-own-banner` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `a-real-build-emits-no-progress-until-it-finishes` | friction | `node:decision-point-playback` | _(a work-tree node — story or capability)_ |
| `a-real-build-emits-no-progress-until-it-finishes` | friction | `asset:diagnosis-honesty-arc` | Diagnosis honesty — a command names its real blocker, not the substrate [arc] |
| `a-record-is-not-an-executor` | principle | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `a-record-is-not-an-executor` | principle | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `a-record-is-not-an-executor` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `a-record-is-not-an-executor` | principle | `asset:stale-prerequisite-links-are-phantoms` | Stale prerequisite links are phantoms [principle] |
| `a-record-is-not-an-executor` | principle | `asset:a-handoff-claim-that-work-landed-is-unverified-state` | A handoff's claim that work landed is unverified state [principle] |
| `a-record-is-not-an-executor` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `a-record-is-not-an-executor` | principle | `asset:citing-a-document-is-not-reading-it` | Citing a document is not reading it [principle] |
| `a-record-is-not-an-executor` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `a-record-is-not-an-executor` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `a-record-is-not-an-executor` | principle | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `a-record-is-not-an-executor` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `a-record-is-not-an-executor` | principle | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `a-record-is-not-an-executor` | principle | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `art-asset-designer-swarm` | pattern | `doc:decisions/0208-art-asset-designer-swarm-fan-out-one-design-subagent-per-vis.md` | Art-asset designer-swarm: fan out one design subagent per visual asset in a frontend unit [adr, now `adr-0208`] |
| `art-asset-designer-swarm` | pattern | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `art-asset-designer-swarm` | pattern | `doc:decisions/0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr, now `adr-0159`] |
| `art-asset-designer-swarm` | pattern | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `art-asset-designer-swarm` | pattern | `asset:render-and-witness-a-flag-guarded-surface` | Render and witness a flag-guarded surface [pattern] |
| `art-asset-designer-swarm` | pattern | `asset:deterministic-parameterised-geometry` | Deterministic, parameterised geometry [principle] |
| `art-asset-designer-swarm` | pattern | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `artifact-new-reports-missing-required-fields-as-unrecognized-keys-naming-the-wrong-problem` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `artifact-retire-reason-ignores-the-at-path-form` | friction | `asset:retire-realized-proposal` | Retire a realized proposal [process] |
| `artifact-retire-reason-ignores-the-at-path-form` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `a-scaffolder-silently-truncates-an-explicitly-passed-id` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `a-scaffolder-silently-truncates-an-explicitly-passed-id` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `a-scaffolder-silently-truncates-an-explicitly-passed-id` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `a-scene-fixture-without-relaxedcells-builds-a-retired-flora-path` | friction | `asset:observability-first` | Observability-first [principle] |
| `a-scene-fixture-without-relaxedcells-builds-a-retired-flora-path` | friction | `doc:decisions/0226-unified-world-art-vegetation-vocabulary-grass-proves-capabil.md` | Unified world-art vegetation vocabulary: grass proves capabilities, flowers prove UAT, retire the witness signpost [adr, now `adr-0226`] |
| `a-scene-fixture-without-relaxedcells-builds-a-retired-flora-path` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `a-security-boundary-sourced-from-a-mutable-checkout-is-only-as-current-as-its-branch` | friction | `node:cli` | _(a work-tree node — story or capability)_ |
| `a-security-boundary-sourced-from-a-mutable-checkout-is-only-as-current-as-its-branch` | friction | `doc:decisions/0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md` | The write-authority wall is agent-inescapable and binds shared checkouts [adr, now `adr-0257`] |
| `a-session-can-drive-a-page-it-cannot-photograph` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `a-session-can-drive-a-page-it-cannot-photograph` | friction | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `a-session-can-drive-a-page-it-cannot-photograph` | friction | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `a-session-goes-inert-with-its-own-background-tasks-still-running` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `a-shape-constant-silently-retimes-the-frames` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `a-shape-constant-silently-retimes-the-frames` | friction | `asset:chapter2-code-generated-organic-art-arc` | Chapter 2 organic art is generated by our own code [arc] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:mechanical-red-redrive-brief` | Scope the edits-existing re-drive brief: one behaviour, mechanical red, frozen build [pattern] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:capability` | capability [definition] |
| `a-spec-body-describes-only-what-it-contracts` | principle | `asset:contract` | contract [definition] |
| `assess-tradeoffs-by-naming-both-sides` | pattern | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `asset` | definition | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `a-story-leg-ordinal-can-collide-with-a-burned-ledger-key-unchecked` | friction | `node:studio-cloud` | _(a work-tree node — story or capability)_ |
| `a-tier-retiring-migration-cannot-see-rows-that-arrive-mid-flight` | friction | `doc:decisions/0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md` | Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind [adr, now `adr-0298`] |
| `a-tier-retiring-migration-cannot-see-rows-that-arrive-mid-flight` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `a-tier-retiring-migration-cannot-see-rows-that-arrive-mid-flight` | friction | `node:library-cli` | _(a work-tree node — story or capability)_ |
| `a-timed-out-background-run-keeps-running-and-is-invisible-to-storytree-own` | friction | `node:unified-command-dispatch` | _(a work-tree node — story or capability)_ |
| `a-tool-route-carries-no-delivery-signal-in-either-direction` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `attempt-privileged-actions-approve-inline` | process | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `attempt-privileged-actions-approve-inline` | process | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `attempt-privileged-actions-approve-inline` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `attempt-privileged-actions-approve-inline` | process | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `attempt-privileged-actions-approve-inline` | process | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `audit-the-signed-verdict` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `audit-the-signed-verdict` | principle | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `audit-the-signed-verdict` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `audit-the-signed-verdict` | principle | `asset:mechanical-red-redrive-brief` | Scope the edits-existing re-drive brief: one behaviour, mechanical red, frozen build [pattern] |
| `audit-the-signed-verdict` | principle | `asset:a-spec-body-describes-only-what-it-contracts` | A spec body describes only what it contracts [principle] |
| `audit-the-signed-verdict` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `audit-the-signed-verdict` | principle | `doc:decisions/0122-per-contract-coverage-check-map-each-declared-contract-to-an.md` | Per-contract coverage check: map each declared contract to an observed test [adr, now `adr-0122`] |
| `audit-the-signed-verdict` | principle | `doc:decisions/0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr, now `adr-0127`] |
| `authoritative-source-beats-derived` | principle | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `authoritative-source-beats-derived` | principle | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `authoritative-source-beats-derived` | principle | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `authoritative-source-beats-derived` | principle | `asset:verification-wins` | verification-wins [principle] |
| `authoritative-source-beats-derived` | principle | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `authoritative-source-beats-derived` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `authoritative-source-beats-derived` | principle | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `authoritative-source-beats-derived` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `authoritative-source-beats-derived` | principle | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `authoritative-source-beats-derived` | principle | `asset:a-handoff-claim-that-work-landed-is-unverified-state` | A handoff's claim that work landed is unverified state [principle] |
| `a-zero-ceiling-local-only-check-reads-a-live-store-a-sibling-session-can-mutate-mid-gate` | friction | `asset:verification-decay-detection` | Verification-decay detection [process] |
| `background-task-notification-reports-the-wrappers-exit-code` | friction | `node:green-gate` | _(a work-tree node — story or capability)_ |
| `backstop-trigger-must-be-observable-in-run` | pattern | `doc:decisions/0256-deferral-keyed-escalation-lines-are-not-built-a-backstop-s-t.md` | Deferral-keyed escalation lines are not built: a backstop's trigger must be observable in-run [adr, now `adr-0256`] |
| `backstop-trigger-must-be-observable-in-run` | pattern | `doc:decisions/0249-oracle-report-freshness-an-unattributable-observation-is-not.md` | Oracle-report freshness: an unattributable observation is not evidence [adr, now `adr-0249`] |
| `backstop-trigger-must-be-observable-in-run` | pattern | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `backstop-trigger-must-be-observable-in-run` | pattern | `asset:an-unattributable-observation-is-not-evidence` | An unattributable observation is not evidence [guardrail] |
| `backstop-trigger-must-be-observable-in-run` | pattern | `asset:fail-closed-conditions-never-share-a-measure` | Independent fail-closed conditions never share a measure [pattern] |
| `backstop-trigger-must-be-observable-in-run` | pattern | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `baseline-preservation` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `baseline-preservation` | principle | `asset:red-green` | red-green [principle] |
| `baseline-preservation` | principle | `asset:no-proof-preservation` | No proof preservation [principle] |
| `blocked-because-x-refuses-was-never-read-at-the-condition` | friction | `asset:machine-uat-signing-gap-arc` | Close the model-driven UAT signing gap [arc] |
| `boundary` | definition | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `boundary` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `boundary` | definition | `doc:decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr, now `adr-0100`] |
| `boundary` | definition | `doc:decisions/0111-desktop-client-step-1-lands-as-the-apps-desktop-surface-and.md` | Desktop client Step 1 lands as the apps/desktop surface and stories/desktop story [adr, now `adr-0111`] |
| `boundary` | definition | `asset:dependency` | dependency [definition] |
| `boundary` | definition | `asset:story` | story [definition] |
| `boundary` | definition | `asset:mock-uat-seam` | mock-UAT seam [definition] |
| `box-headroom-before-a-gate-has-no-verb` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `built-a-mechanism-for-a-defect-i-had-not-traced-to-its-source-buffer` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `built-a-mechanism-for-a-defect-i-had-not-traced-to-its-source-buffer` | friction | `doc:decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr, now `adr-0280`] |
| `bun-test-runs-a-mis-parameterised-instrument-to-completion` | friction | `node:render-core` | _(a work-tree node — story or capability)_ |
| `calibrate-ceremony-to-stakes` | principle | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `calibrate-ceremony-to-stakes` | principle | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `calibrate-ceremony-to-stakes` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `calibrate-ceremony-to-stakes` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `calibrate-ceremony-to-stakes` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `calibrate-ceremony-to-stakes` | principle | `asset:plain-language-first` | Plain language first [principle] |
| `calibrate-ceremony-to-stakes` | principle | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `calibrate-ceremony-to-stakes` | principle | `doc:decisions/0219-generative-image-models-enter-the-art-pipeline-author-time-o.md` | Generative image models enter the art pipeline author-time only, bridged to checkable vector [adr, now `adr-0219`] |
| `calibrate-ceremony-to-stakes` | principle | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `camera-probe-non-accretion-proxy-conflated-stable-picture` | friction | `node:act2-regrow-camera-frame-delivery` | _(a work-tree node — story or capability)_ |
| `camera-probe-non-accretion-proxy-conflated-stable-picture` | friction | `doc:research/act2-camera-frame-delivery-2026-08-06/camera-rasterisation.json` | _(a repo path, not a library row)_ |
| `capability` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `capability` | definition | `asset:story` | story [definition] |
| `capability` | definition | `asset:contract` | contract [definition] |
| `capability` | definition | `asset:dependency` | dependency [definition] |
| `capability-spec-with-would-be-uat-reads-as-spec-missing` | friction | `node:invite-ui` | _(a work-tree node — story or capability)_ |
| `capability-spec-with-would-be-uat-reads-as-spec-missing` | friction | `node:studio-members` | _(a work-tree node — story or capability)_ |
| `capture-cold-vite-load-times-out-and-reads-as-a-page-failure` | friction | `doc:research/chapter2-islanders-canopy-2026-08-22/README.md` | _(a repo path, not a library row)_ |
| `capture-default-url-is-a-port-a-sibling-worktree-may-own` | friction | `doc:research/chapter2-islanders-canopy-2026-08-22/README.md` | _(a repo path, not a library row)_ |
| `capture-default-url-is-a-port-a-sibling-worktree-may-own` | friction | `asset:chapter2-island-that-looks-good-first-arc` | The island is made to look good first, and what it needs is worked out backwards [arc] |
| `capture-palette-check-reports-a-breach-and-exits-zero` | friction | `doc:research/chapter2-island-props-2026-08-21/README.md` | _(a repo path, not a library row)_ |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:two-surfaces-required-to-agree-are-gated` | Two surfaces required to agree are gated [guardrail] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:pin-the-dual-runtime-import-form` | The published surface is not evidence of runtime shape -- probe, then pin [pattern] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:a-live-only-guarantee-is-an-honesty-gap` | A live-only-provable guarantee is an honesty gap [principle] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | An assert-oracle proof that cannot fail is not a proof [guardrail] |
| `capture-the-oracle-for-a-convention-you-dont-own` | principle | `asset:a-mocked-seam-leaves-its-default-implementation-unproven` | A mocked seam leaves its default implementation unproven [principle] |
| `carried-forward-invariant-silently-became-the-schedule` | friction | `doc:decisions/0285-an-island-forms-the-moment-a-pathway-reaches-it-not-when-all.md` | An island forms the moment a pathway reaches it, not when all its ground has settled [adr, now `adr-0285`] |
| `carried-forward-invariant-silently-became-the-schedule` | friction | `doc:decisions/0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md` | Act 2 growth follows the edge: pathways grow from settled nodes, and one layout [adr, now `adr-0283`] |
| `carried-forward-invariant-silently-became-the-schedule` | friction | `doc:decisions/0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr, now `adr-0282`] |
| `carried-forward-invariant-silently-became-the-schedule` | friction | `node:app-surface-world-view` | _(a work-tree node — story or capability)_ |
| `chapter2-pixellab-full-island-app-witness-20260731` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `chapter2-pixellab-full-island-app-witness-20260731` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `chapter2-pixellab-full-island-app-witness-20260731` | increment | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `chapter2-pixellab-full-island-app-witness-20260731` | increment | `asset:merge-ceremony` | Merge ceremony [process] |
| `chapter2-pixellab-full-island-app-witness-20260731` | increment | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `check-coverage-prints-no-total-for-the-two-axes-it-gates-on` | friction | `node:proof-binding-integrity` | _(a work-tree node — story or capability)_ |
| `check-web-engine-skip-reads-as-pass` | friction | `node:render-core` | _(a work-tree node — story or capability)_ |
| `chip-carried-increment-is-invisible-to-arc-lifecycle` | friction | `doc:decisions/0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr, now `adr-0335`] |
| `chip-carried-increment-is-invisible-to-arc-lifecycle` | friction | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `ci-cd-spec-files-mixed-list-indent-breaks-exact-match-edits` | friction | `node:ci-cd` | _(a work-tree node — story or capability)_ |
| `citation-field-doc-ref-legality-is-contradictory` | friction | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `citing-a-document-is-not-reading-it` | principle | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:a-handoff-claim-that-work-landed-is-unverified-state` | A handoff's claim that work landed is unverified state [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `citing-a-document-is-not-reading-it` | principle | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `citing-a-document-is-not-reading-it` | principle | `doc:decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr, now `adr-0139`] |
| `citing-a-document-is-not-reading-it` | principle | `doc:decisions/0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md` | Studio map responsiveness — cache and defer before cutting density [adr, now `adr-0240`] |
| `citing-a-document-is-not-reading-it` | principle | `doc:decisions/0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md` | Retire the model UAT witness tier — the witness split is human or machine [adr, now `adr-0247`] |
| `citing-a-document-is-not-reading-it` | principle | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `claim` | definition | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `claim` | definition | `doc:decisions/0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md` | Per-unit write-claim refuses a second concurrent build of one unit [adr, now `adr-0121`] |
| `claim` | definition | `doc:decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr, now `adr-0138`] |
| `claim` | definition | `doc:decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md` | The noticeboard is the claim ledger — forced session claims, presence retired [adr, now `adr-0200`] |
| `claim` | definition | `doc:decisions/0310-typed-claim-namespace-and-the-addressable-object-fork.md` | The claim namespace is typed and resolvable, and which object becomes addressable next is an owner fork [adr, now `adr-0310`] |
| `claim` | definition | `doc:decisions/0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr, now `adr-0317`] |
| `claim` | definition | `asset:noticeboard` | noticeboard [definition] |
| `claim` | definition | `asset:write-ownership` | write-ownership [definition] |
| `claim-audit-holdings-reports-still-held-for-a-cleared-row` | friction | `asset:first-class-edges-arc` | The pathways between story nodes are first-class, addressable, claimable objects [arc] |
| `claim-audit-holdings-reports-still-held-for-a-cleared-row` | friction | `asset:claim-audit-log-read-verb` | A read verb over events.claim_event — the missing instrument (increment 1, UNCONDITIONAL) [increment] |
| `claim-journey-requires-an-identity-before-it-creates-one` | friction | `asset:codex-drives-a-unit-at-parity` | Codex drives a unit of storytree work end to end [increment] |
| `claim-ledger-has-no-node-for-decision-log-curation` | friction | `node:compositor-pan-transform` | _(a work-tree node — story or capability)_ |
| `claim-ledger-has-no-node-for-decision-log-curation` | friction | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `claim-ledger-has-no-node-for-decision-log-curation` | friction | `doc:decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr, now `adr-0139`] |
| `claims-in-the-shared-store` | guardrail | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `claims-in-the-shared-store` | guardrail | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `claims-in-the-shared-store` | guardrail | `doc:decisions/0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md` | Per-unit write-claim refuses a second concurrent build of one unit [adr, now `adr-0121`] |
| `claims-in-the-shared-store` | guardrail | `doc:decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr, now `adr-0138`] |
| `claims-in-the-shared-store` | guardrail | `doc:decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md` | The noticeboard is the claim ledger — forced session claims, presence retired [adr, now `adr-0200`] |
| `claims-in-the-shared-store` | guardrail | `asset:claim` | claim [definition] |
| `claim-the-owning-story` | principle | `asset:claims-in-the-shared-store` | Claims live in the shared store [guardrail] |
| `claim-the-owning-story` | principle | `asset:write-ownership` | write-ownership [definition] |
| `claim-the-owning-story` | principle | `asset:defects-amend-the-owning-story` | defects-amend-the-owning-story [principle] |
| `claim-the-owning-story` | principle | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `claim-the-owning-story` | principle | `doc:decisions/0222-split-the-art-factory-into-its-own-story-forest-world-gains.md` | Split the art factory into its own story; forest-world gains a capability floor [adr, now `adr-0222`] |
| `claim-the-owning-story` | principle | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `cli-relocations-keep-an-alias` | guardrail | `asset:cli-surface-is-a-superset-of-the-ui` | The CLI surface is a superset of the UI [pattern] |
| `cli-relocations-keep-an-alias` | guardrail | `doc:decisions/0118-workflow-first-cli-surface-proof-commands-mirror-the-studio.md` | Workflow-first CLI surface: proof commands mirror the studio's workflows, primitives nest below [adr, now `adr-0118`] |
| `cli-surface-is-a-superset-of-the-ui` | pattern | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `cli-surface-is-a-superset-of-the-ui` | pattern | `asset:deep-modules` | Deep modules [principle] |
| `cli-surface-is-a-superset-of-the-ui` | pattern | `doc:decisions/0118-workflow-first-cli-surface-proof-commands-mirror-the-studio.md` | Workflow-first CLI surface: proof commands mirror the studio's workflows, primitives nest below [adr, now `adr-0118`] |
| `codex-managed-hook-needs-the-portable-command-field` | friction | `doc:decisions/0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md` | Interactive Codex writes only in its current claimed worktree [adr, now `adr-0355`] |
| `cold-rebuild` | principle | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `cold-rebuild` | principle | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `cold-rebuild` | principle | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `committed-evidence-artifact-with-no-producer` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `committed-evidence-artifact-with-no-producer` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `concurrent-gates-on-one-dev-box-wedge-each-other-silently` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `concurrent-library-artifact-edits-clobber-with-no-detection` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `concurrent-library-artifact-edits-clobber-with-no-detection` | friction | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `concurrent-library-artifact-edits-clobber-with-no-detection` | friction | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `confirm-red-is-file-granular-so-a-green-on-arrival-contract-is-invisible` | friction | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `confirm-red-is-file-granular-so-a-green-on-arrival-contract-is-invisible` | friction | `doc:decisions/0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr, now `adr-0126`] |
| `consuming-surface` | definition | `asset:boundary` | boundary [definition] |
| `consuming-surface` | definition | `asset:cross-story-dependency` | Cross-story dependency direction and the no-cycle rule [principle] |
| `consuming-surface` | definition | `asset:observability-first` | Observability-first [principle] |
| `consuming-surface` | definition | `asset:story` | story [definition] |
| `consuming-surface` | definition | `doc:decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr, now `adr-0100`] |
| `consuming-surface` | definition | `doc:decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr, now `adr-0074`] |
| `contract` | definition | `asset:capability` | capability [definition] |
| `contract` | definition | `asset:contract-test` | contract test [definition] |
| `contract` | definition | `asset:proof-mode` | Proof mode [definition] |
| `contract-coverage-counts-ids-not-the-behaviours-a-contract-asserts` | friction | `node:arc-explicit-id-fidelity` | _(a work-tree node — story or capability)_ |
| `contract-test` | definition | `asset:contract` | contract [definition] |
| `contract-test` | definition | `asset:proof-mode` | Proof mode [definition] |
| `contract-test` | definition | `asset:uat` | UAT [definition] |
| `control-byte-makes-source-invisible-to-grep` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `convergence` | definition | `doc:decisions/0003-v1-reversal-ledger.md` | v1→v2 disposition ledger [adr, now `adr-0003`] |
| `convergence` | definition | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `convergence` | definition | `asset:cold-rebuild` | cold-rebuild [principle] |
| `corpus-content-gate-red-on-sibling-mid-stream-live-edit` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `corpus-investigator` | agent | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `corpus-investigator` | agent | `asset:verification-wins` | verification-wins [principle] |
| `corpus-investigator` | agent | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `corpus-investigator` | agent | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `corpus-investigator` | agent | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `corpus-investigator` | agent | `asset:exploration-principles` | Exploration principles [principle] |
| `corpus-investigator` | agent | `asset:orchestrator-is-sole-fan-out` | The orchestrator is the sole fan-out point [guardrail] |
| `corpus-investigator` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `corpus-investigator` | agent | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `corpus-investigator` | agent | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `corpus-investigator` | agent | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `corpus-investigator` | agent | `asset:citing-a-document-is-not-reading-it` | Citing a document is not reading it [principle] |
| `crlf-in-a-story-file-makes-every-uat-reader-report-zero-criteria` | friction | `node:embedded-terminal` | _(a work-tree node — story or capability)_ |
| `crlf-in-a-story-file-makes-every-uat-reader-report-zero-criteria` | friction | `asset:uat-criterion-prose-must-not-assert-its-own-proof-state` | A criterion's prose stops asserting its own proof state [increment] |
| `cross-story-dependency` | principle | `doc:decisions/0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr, now `adr-0058`] |
| `cross-story-dependency` | principle | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `cross-story-dependency` | principle | `doc:decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr, now `adr-0074`] |
| `cross-story-dependency` | principle | `doc:decisions/0166-declared-edge-honesty-gates-blocking-unbacked-edges-for-pack.md` | Declared-edge honesty gates: blocking unbacked edges for package-owning stories, advisory redundant-transitive WARN, and the artifact_edges annotation [adr, now `adr-0166`] |
| `cross-story-dependency` | principle | `asset:journey-principle` | The journey principle [principle] |
| `cross-story-dependency` | principle | `asset:splitting-rule` | The splitting rule [principle] |
| `cross-story-dependency` | principle | `asset:dependency` | dependency [definition] |
| `cross-story-dependency` | principle | `asset:boundary` | boundary [definition] |
| `dag` | definition | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `dag` | definition | `asset:story` | story [definition] |
| `dag` | definition | `asset:capability` | capability [definition] |
| `dag` | definition | `asset:dependency` | dependency [definition] |
| `dag` | definition | `asset:node` | node [definition] |
| `db-control` | process | `doc:decisions/0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr, now `adr-0063`] |
| `db-control` | process | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `db-control` | process | `doc:decisions/0015-gcp-hosting-cloud-sql-event-store.md` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr, now `adr-0015`] |
| `db-control` | process | `doc:decisions/0021-keyless-agent-session-auth-and-db-bootstrap.md` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr, now `adr-0021`] |
| `db-control` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `db-control` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `db-control` | process | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `db-probe-reports-unreachable-when-the-local-box-is-saturated` | friction | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `db-schema-applies-ddl-while-reading-as-an-inspection-verb` | friction | `doc:machine-onboarding.md` | _(a repo path, not a library row)_ |
| `dead-symbol-triage-grepped-the-caller-not-the-symbol` | friction | `node:worker-relocation` | _(a work-tree node — story or capability)_ |
| `dead-symbol-triage-grepped-the-caller-not-the-symbol` | friction | `doc:decisions/0404-dispatching-a-build-is-a-cli-verb-retire-the-in-app-build-an.md` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr, now `adr-0404`] |
| `decay-ceiling-charges-sessions-for-a-sibling-red` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:meter-fail-closed-caps-in-real-cost` | Meter a fail-closed cap in real cost [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:survival-test-for-adrs` | The survival test for ADRs [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:two-consumer-extraction` | Two-consumer extraction [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:assess-tradeoffs-by-naming-both-sides` | Assess tradeoffs by naming both sides [pattern] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:escalate-inline-or-on-a-named-signal` | Escalate inline, or on a named signal [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `decide-against-a-standard-not-a-budget` | principle | `asset:a-measured-claim-carries-its-method` | A measured claim carries the method that produced it [pattern] |
| `decide-against-a-standard-not-a-budget` | principle | `doc:decisions/0288-not-worth-a-session-is-a-first-class-outcome-restore-discret.md` | Not worth a session is a first-class outcome: restore discretion at the closing leg [adr, now `adr-0288`] |
| `decide-against-a-standard-not-a-budget` | principle | `doc:decisions/0032-cite-graduation-mechanism.md` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr, now `adr-0032`] |
| `decide-against-a-standard-not-a-budget` | principle | `doc:decisions/0084-agents-may-flip-an-adr-green.md` | Agents may flip an ADR green [adr, now `adr-0084`] |
| `declared-proof-gate-command-is-proven-by-nothing` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `declared-proof-gate-command-is-proven-by-nothing` | friction | `asset:adr-0425` | Studio commenting is retired until multiplayer [adr] |
| `declared-proof-gate-command-is-proven-by-nothing` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `declare-from-merged-worktree-fences-own-next-worktree` | friction | `asset:gate-self-report-honesty-arc` | Gate self-report honesty — the per-step table means what it says [arc] |
| `declare-from-merged-worktree-fences-own-next-worktree` | friction | `node:green-gate` | _(a work-tree node — story or capability)_ |
| `declare-from-merged-worktree-fences-own-next-worktree` | friction | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `declare-from-merged-worktree-fences-own-next-worktree` | friction | `doc:decisions/0275-sessions-may-continue-past-merge-the-unit-ends-ending-the-se.md` | Sessions may continue past merge: the unit ends; ending the session is an orchestration call [adr, now `adr-0275`] |
| `declare-from-merged-worktree-fences-own-next-worktree` | friction | `doc:decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md` | Branch dies on merge; the wisp survives via claim-at-declare [adr, now `adr-0142`] |
| `declare-reports-success-while-taking-no-claim` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `deep-modules` | principle | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `delegate-exploration-to-digest-subagents` | principle | `asset:exploration-principles` | Exploration principles [principle] |
| `delegate-exploration-to-digest-subagents` | principle | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `deleting-a-named-clause-leaves-its-prose-quoters-uncorrected` | friction | `asset:adr-0411` | A session aims at the whole arc; the three-continuation count is replaced by a context-headroom mark [adr] |
| `deleting-a-named-clause-leaves-its-prose-quoters-uncorrected` | friction | `asset:adr-0319` | A just-unblocked lane on a live arc is dispatched by default; the orchestrator picks the vehicle [adr] |
| `deleting-a-named-clause-leaves-its-prose-quoters-uncorrected` | friction | `asset:adr-0329` | A small unit is driven in-thread, not cut into a fresh session [adr] |
| `deleting-a-named-clause-leaves-its-prose-quoters-uncorrected` | friction | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `de-noise-promotes-never-drops` | principle | `doc:decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr, now `adr-0074`] |
| `de-noise-promotes-never-drops` | principle | `doc:decisions/0102-shared-islands-promote-edges-to-per-island-icon-stamps.md` | Shared islands promote their edges to per-island icon stamps (you carry the icon of what you depend on) [adr, now `adr-0102`] |
| `de-noise-promotes-never-drops` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `de-noise-promotes-never-drops` | principle | `asset:observability-first` | Observability-first [principle] |
| `dependency` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `dependency` | definition | `asset:boundary` | boundary [definition] |
| `dependency` | definition | `asset:capability` | capability [definition] |
| `dependency` | definition | `asset:story` | story [definition] |
| `dependency` | definition | `asset:dag` | DAG [definition] |
| `desktop-e2e-conventions` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `desktop-e2e-conventions` | process | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `desktop-e2e-conventions` | process | `doc:decisions/0111-desktop-client-step-1-lands-as-the-apps-desktop-surface-and.md` | Desktop client Step 1 lands as the apps/desktop surface and stories/desktop story [adr, now `adr-0111`] |
| `desktop-e2e-conventions` | process | `doc:decisions/0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md` | Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table [adr, now `adr-0119`] |
| `desktop-e2e-conventions` | process | `doc:decisions/0176-the-desktop-app-requires-a-reachable-db-and-a-git-checkout-t.md` | The desktop app requires a reachable DB and a git checkout to launch — retire the degraded read shell [adr, now `adr-0176`] |
| `desktop-e2e-conventions` | process | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `deterministic-parameterised-geometry` | principle | `doc:decisions/0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr, now `adr-0069`] |
| `deterministic-parameterised-geometry` | principle | `doc:decisions/0062-the-forest-world-is-the-observability-layer-rendered-one-art.md` | The forest world is the observability layer rendered: one art element per signal [adr, now `adr-0062`] |
| `deterministic-parameterised-geometry` | principle | `doc:decisions/0036-story-world-studio-visualisation.md` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr, now `adr-0036`] |
| `deterministic-parameterised-geometry` | principle | `asset:observability-first` | Observability-first [principle] |
| `diagnostic-prose-attributes-its-figure-to-a-consumer` | friction | `asset:traversal-panel-draws-the-decision-depth` | The replay's depth reading walks through decisions [increment] |
| `diagnostic-prose-attributes-its-figure-to-a-consumer` | friction | `asset:traversal-panel-arc` | The context traversal replay panel is built against its signed design [arc] |
| `directional-dag-arc` | arc | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `directional-dag-arc` | arc | `asset:recursive-decomposition-patterns` | Recursive decomposition patterns [pattern] |
| `directional-dag-arc` | arc | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `doctor-claude-login-fails-a-correctly-provisioned-vault-box` | friction | `doc:machine-onboarding.md` | _(a repo path, not a library row)_ |
| `doc-vs-implementation-precedence` | principle | `asset:assess-tradeoffs-by-naming-both-sides` | Assess tradeoffs by naming both sides [pattern] |
| `doc-vs-implementation-precedence` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `dogfood-fix-the-source` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `drain-ceiling-reds-the-gate-on-every-freshly-authored-spec` | friction | `asset:zero-contract-coverage-lets-an-unimplemented-contract-ship-on-a-signed-pass` | A capability read 0/13 contract coverage and shipped a signed PASS over an unimplemented contract [friction] |
| `drifted-increment-may-be-already-delivered` | friction | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `drifted-increment-may-be-already-delivered` | friction | `doc:decisions/0207-explorer-onboarding-v1-desktop-entrypoint-dev-owned-claude-a.md` | Explorer onboarding v1: desktop entrypoint, dev-owned Claude auth, hosted live read, public distribution [adr, now `adr-0207`] |
| `drifted-increment-may-be-already-delivered` | friction | `node:app-guide` | _(a work-tree node — story or capability)_ |
| `durable-workflow-per-node` | pattern | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `durable-workflow-per-node` | pattern | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `durable-workflow-per-node` | pattern | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `each-pg-cli-read-pays-a-fresh-connector-handshake` | friction | `asset:context-decision-tree-arc` | Context decision tree — what was offered, and what the agent chose [arc] |
| `edit-story-uat-criteria` | process | `doc:decisions/0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr, now `adr-0294`] |
| `edit-story-uat-criteria` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `edit-story-uat-criteria` | process | `doc:decisions/0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr, now `adr-0106`] |
| `edit-story-uat-criteria` | process | `asset:tightening-a-shared-contract-needs-a-full-sweep` | Tightening a shared contract needs a full sweep [principle] |
| `edit-story-uat-criteria` | process | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `end-at-merge-arc` | arc | `asset:merge-ceremony` | Merge ceremony [process] |
| `end-at-merge-arc` | arc | `asset:session-orchestrator` | session-orchestrator [agent] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:a-contract-that-says-observable-must-name-its-observer` | A contract that says "observable" must name its observer [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:a-deferral-recorded-without-a-status-reads-as-pending-work` | A deferral recorded without a status reads as pending work [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:price-the-deferral` | Price the deferral [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:calibrate-ceremony-to-stakes` | Calibrate ceremony to stakes [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:a-decision-that-blinds-an-instrument-escalates-inline` | A decision that blinds an instrument escalates inline [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `asset:decide-against-a-standard-not-a-budget` | Decide against a standard, not a budget [principle] |
| `escalate-inline-or-on-a-named-signal` | principle | `doc:decisions/0303-an-escalation-is-a-landing-event-a-blocked-session-lands-its.md` | An escalation is a landing event: a blocked session lands its state and releases its claims [adr, now `adr-0303`] |
| `escalate-inline-or-on-a-named-signal` | principle | `doc:decisions/0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr, now `adr-0314`] |
| `escalate-inline-or-on-a-named-signal` | principle | `doc:decisions/0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md` | The librarian pass is trigger-gated and split, not per-landing [adr, now `adr-0324`] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `doc:decisions/0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr, now `adr-0156`] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:probe-dont-assume-db-reachability` | Probe DB reachability, never infer it [principle] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `escalate-up-when-blocked-or-out-of-scope` | guardrail | `asset:a-handoff-claim-that-work-landed-is-unverified-state` | A handoff's claim that work landed is unverified state [principle] |
| `event` | definition | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `event` | definition | `asset:event-log` | event log [definition] |
| `event` | definition | `asset:pi-event-stream` | owned-loop event stream [definition] |
| `event` | definition | `asset:approval-event-promotion-event` | approval event / promotion event [definition] |
| `event` | definition | `asset:node-rollup` | node rollup [definition] |
| `event-log` | definition | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `event-log` | definition | `asset:event` | event [definition] |
| `event-log` | definition | `asset:node-rollup` | node rollup [definition] |
| `event-log-then-projection` | pattern | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `evidence` | definition | `asset:gate` | gate [definition] |
| `evidence` | definition | `asset:verdict` | verdict [definition] |
| `evidence` | definition | `asset:proof-hash` | proof hash [definition] |
| `evidence` | definition | `asset:red-green` | red-green [principle] |
| `evidence-nothing-branches-on-is-unfalsifiable` | friction | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `evidence-nothing-branches-on-is-unfalsifiable` | friction | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `evidence-nothing-branches-on-is-unfalsifiable` | friction | `asset:test-creation-principles` | Test creation principles [principle] |
| `evidence-nothing-branches-on-is-unfalsifiable` | friction | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `evidence-nothing-branches-on-is-unfalsifiable` | friction | `node:drive-machinery` | _(a work-tree node — story or capability)_ |
| `example-carries-the-discriminator` | pattern | `asset:signal-and-noise` | Signal and noise [principle] |
| `example-carries-the-discriminator` | pattern | `asset:guidance-quality` | Guidance quality [principle] |
| `exploration-principles` | principle | `asset:recursive-decomposition-patterns` | Recursive decomposition patterns [pattern] |
| `explorer-onboarding-plan-1` | increment | `asset:app-guide` | _(target is not a live row)_ |
| `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift` | friction | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift` | friction | `doc:decisions/0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md` | Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated [adr, now `adr-0120`] |
| `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift` | friction | `doc:decisions/0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md` | Narrow the live-to-seed export scope to the durable tier: an allowlist, not a denylist [adr, now `adr-0263`] |
| `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift` | friction | `node:signal-synthesis` | _(a work-tree node — story or capability)_ |
| `fail-closed-conditions-never-share-a-measure` | pattern | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `fail-closed-conditions-never-share-a-measure` | pattern | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `fail-closed-conditions-never-share-a-measure` | pattern | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `fail-closed-conditions-never-share-a-measure` | pattern | `asset:an-advisory-list-stays-readable-or-stops-being-advisory` | An advisory list stays readable or stops being advisory [guardrail] |
| `failed-out-write-leaves-a-strangers-file-at-the-path` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `fail-fast-journey-test-understates-its-own-breakage` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `fail-fast-journey-test-understates-its-own-breakage` | friction | `asset:adr-0425` | Studio commenting is retired until multiplayer [adr] |
| `fail-fast-journey-test-understates-its-own-breakage` | friction | `asset:uat-studio-criteria-reconciliation` | Reconcile the studio story UAT with the surfaces the product has [increment] |
| `faked-uat-theatre` | pattern | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `file-tools-write-a-control-char-literally-and-both-shell-repairs-are-blocked` | friction | `asset:control-byte-makes-source-invisible-to-grep` | A single control byte in committed source makes the file invisible to content search, so a session reads absence [friction] |
| `five-typescript-constructs-this-house-never-writes` | guardrail | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `five-typescript-constructs-this-house-never-writes` | guardrail | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `fixing-one-restatement-banked-a-false-done-in-an-adr` | friction | `node:invite-ui` | _(a work-tree node — story or capability)_ |
| `fixing-one-restatement-banked-a-false-done-in-an-adr` | friction | `node:studio-members` | _(a work-tree node — story or capability)_ |
| `foreign-project-forest-arc` | arc | `asset:distribution-posture-arc` | Distribution posture [arc] |
| `forest-parcels-arc` | arc | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `forest-parcels-plan-1` | increment | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `forest-parcels-plan-1` | increment | `doc:decisions/0208-art-asset-designer-swarm-fan-out-one-design-subagent-per-vis.md` | Art-asset designer-swarm: fan out one design subagent per visual asset in a frontend unit [adr, now `adr-0208`] |
| `forest-parcels-plan-1` | increment | `doc:decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md` | Shared forest-world render core for studio and the public website [adr, now `adr-0093`] |
| `forest-parcels-plan-1` | increment | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `forest-parcels-plan-1` | increment | `doc:decisions/0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr, now `adr-0159`] |
| `forest-parcels-plan-1` | increment | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `forest-parcels-plan-1` | increment | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `forest-parcels-plan-1` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `forest-parcels-plan-2` | increment | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `forest-parcels-plan-2` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `forest-parcels-plan-2` | increment | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0208-art-asset-designer-swarm-fan-out-one-design-subagent-per-vis.md` | Art-asset designer-swarm: fan out one design subagent per visual asset in a frontend unit [adr, now `adr-0208`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md` | Shared forest-world render core for studio and the public website [adr, now `adr-0093`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md` | frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness [adr, now `adr-0159`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr, now `adr-0082`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md` | Proof paints the world — verdict-derived green and the human-witness signpost [adr, now `adr-0040`] |
| `forest-parcels-plan-2` | increment | `doc:decisions/0044-per-uat-test-human-attestation.md` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr, now `adr-0044`] |
| `forest-parcels-plan-3` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `forest-parcels-plan-3` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `forest-parcels-plan-3` | increment | `asset:website-release` | Release the public website [process] |
| `forest-parcels-plan-3` | increment | `doc:decisions/0236-forest-flora-counts-observed-automated-tests-not-declared-co.md` | Forest flora counts observed automated tests, not declared contracts [adr, now `adr-0236`] |
| `forest-parcels-plan-3` | increment | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `fr-arc-show-hides-the-claim-fence-on-its-own-open-work` | friction | `asset:decision-read-measurement-arc` | Measure which decisions sessions actually read [arc] |
| `fr-arc-show-hides-the-claim-fence-on-its-own-open-work` | friction | `asset:compose-the-treated-arm-with-a-staleness-marker` | Compose the treated arm at the frontier, with an outstanding-effects marker [increment] |
| `fr-arc-show-hides-the-claim-fence-on-its-own-open-work` | friction | `asset:adr-0346` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr] |
| `fr-cross-arc-fence-does-not-reach-the-increment-it-blocks` | friction | `asset:shared-camera-angle-rises-to-birds-eye` | The shared camera angle rises to a birds-eye value [increment] |
| `fr-cross-arc-fence-does-not-reach-the-increment-it-blocks` | friction | `asset:frontend-visual-judgment-arc` | The frontend agent judges a visual surface on its own two feet [arc] |
| `fr-cross-arc-fence-does-not-reach-the-increment-it-blocks` | friction | `asset:chapter2-code-generated-organic-art-arc` | Chapter 2 organic art is generated by our own code [arc] |
| `fr-d5-test-named-three-different-instruments` | friction | `asset:adr-0419` | Decision support edges move to dependsOn by deprecation; an amends edge obliges an in-place annotation [adr] |
| `fr-d5-test-named-three-different-instruments` | friction | `asset:oq-retire-the-amends-edge` | Do we retire the amends edge entirely, leaving one support edge and prose-only amendment? [open-question] |
| `fr-d5-test-named-three-different-instruments` | friction | `doc:research/amends-reach-2026-08-23.md` | _(a repo path, not a library row)_ |
| `friction-adjudication` | process | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `friction-adjudication` | process | `doc:decisions/0032-cite-graduation-mechanism.md` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr, now `adr-0032`] |
| `friction-adjudication` | process | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `friction-adjudication` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `friction-adjudication` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `friction-adjudication` | process | `doc:decisions/0024-blind-reconstruction-test-for-documentation.md` | A definition earns its place only if a cold agent can't reconstruct it (the blind-reconstruction test) [adr, now `adr-0024`] |
| `friction-adjudication` | process | `doc:decisions/0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr, now `adr-0161`] |
| `friction-adjudication` | process | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `friction-adjudication` | process | `asset:signal-and-noise` | Signal and noise [principle] |
| `friction-adjudication` | process | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `friction-adjudication` | process | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `friction-adjudication` | process | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `friction-adjudication` | process | `asset:meter-fail-closed-caps-in-real-cost` | Meter a fail-closed cap in real cost [principle] |
| `friction-adjudication` | process | `asset:corpus-investigator` | corpus-investigator [agent] |
| `friction-adjudication` | process | `asset:guidance-curator` | guidance-curator [agent] |
| `friction-adjudication` | process | `asset:story-author` | story-author [agent] |
| `friction-adjudication` | process | `asset:graduation-synthesist` | graduation-synthesist [agent] |
| `friction-adjudication` | process | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `friction-adjudication` | process | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `friction-analyst` | agent | `asset:signal-and-noise` | Signal and noise [principle] |
| `friction-analyst` | agent | `asset:observability-first` | Observability-first [principle] |
| `friction-analyst` | agent | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `friction-analyst` | agent | `asset:exploration-principles` | Exploration principles [principle] |
| `friction-analyst` | agent | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `friction-analyst` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `friction-analyst` | agent | `asset:reward-hacking` | Reward hacking [principle] |
| `friction-analyst` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `friction-arc-increment-retry-duplicates-after-ambiguous-timeout` | friction | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `friction-arc-increment-retry-duplicates-after-ambiguous-timeout` | friction | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `friction-arc-recall-shadowed-the-named-arc` | friction | `asset:decision-log-readers-arc` | The decision log's readers catch up [arc] |
| `friction-arc-recall-shadowed-the-named-arc` | friction | `asset:decision-read-measurement-arc` | Measure which decisions sessions actually read [arc] |
| `friction-brief-asserted-stale-live-tier-state` | friction | `asset:arc-orientation-surface-arc` | Arcs as the map's primary orientation surface [arc] |
| `friction-brief-asserted-stale-live-tier-state` | friction | `doc:decisions/0267-arcs-take-the-map-s-primary-top-drawer-slot-the-library-beco.md` | Arcs take the map's primary top-drawer slot, the Library becomes secondary [adr, now `adr-0267`] |
| `friction-builder-agents-stall-awaiting-background-gate` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `friction-bun-path-reds-every-full-gate-on-this-box` | friction | `asset:adr-0419` | Decision support edges move to dependsOn by deprecation; an amends edge obliges an in-place annotation [adr] |
| `friction-capture-surface-is-itself-high-friction` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `friction-cli-has-no-show-verb` | friction | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `friction-codex-real-implement-no-source-tools` | friction | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `friction-codex-root-session-cannot-declare-presence` | friction | `doc:decisions/0033-session-presence-notice-board.md` | The notice board is session presence — advisory coordination for parallel sessions [adr, now `adr-0033`] |
| `friction-contract-asserts-type-beyond-real-scope` | friction | `asset:friction-cap-covers-outside-real-scope-burns-leaf-run` | A contract that covers a file outside its cap's real write scope burns a full leaf run before failing closed [friction] |
| `friction-db-up-poll-false-unreachable-while-socket-accepts` | friction | `node:db-lifecycle-control` | _(a work-tree node — story or capability)_ |
| `friction-deletion-plans-miss-disk-scanning-proof-couplings` | friction | `asset:plan` | Plan [definition] |
| `friction-deletion-plans-miss-disk-scanning-proof-couplings` | friction | `asset:noticeboard-claim-ledger-plan-6` | Noticeboard claim ledger — build plan (inc 6: the presence RETIREMENT SWEEP — the arc's LAST increment) [increment] |
| `friction-designer-glow-css-opacity-animation-override` | friction | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `friction-drain-routable-omits-the-age-half-of-its-own-fence` | friction | `asset:friction-adjudication` | Friction adjudication [process] |
| `friction-gate-wall-clock-perf-threshold-false-red` | friction | `doc:decisions/0276-wall-clock-timing-leaves-the-gate-tier.md` | Wall-clock timing leaves the gate tier [adr, now `adr-0276`] |
| `friction-import-grep-matches-comments` | friction | `doc:decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md` | Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible [adr, now `adr-0074`] |
| `friction-increment-named-four-writers-a-day-old-sibling-had-already-answered` | friction | `asset:adr-0424` | Grounded claims on accepted decisions — bind code evidence at the green flip [adr] |
| `friction-increment-named-four-writers-a-day-old-sibling-had-already-answered` | friction | `asset:adr-0428` | Compose at the chain frontier, per record, with an outstanding-effects marker [adr] |
| `friction-increment-named-four-writers-a-day-old-sibling-had-already-answered` | friction | `asset:adr-0431` | Retire the amends edge: one support edge, prose-carried amendment, and search as the discovery route [adr] |
| `friction-justification-bar` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `friction-justification-bar` | principle | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `friction-justification-bar` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `friction-justification-bar` | principle | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `friction-justification-bar` | principle | `asset:two-consumer-extraction` | Two-consumer extraction [principle] |
| `friction-justification-bar` | principle | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `friction-justification-bar` | principle | `doc:decisions/0024-blind-reconstruction-test-for-documentation.md` | A definition earns its place only if a cold agent can't reconstruct it (the blind-reconstruction test) [adr, now `adr-0024`] |
| `friction-justification-bar` | principle | `doc:decisions/0032-cite-graduation-mechanism.md` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr, now `adr-0032`] |
| `friction-no-oneshot-db-probe` | friction | `node:db-lifecycle-control` | _(a work-tree node — story or capability)_ |
| `friction-nothing-names-which-commit-an-anchor-is-frozen-against` | friction | `asset:adr-0424` | Grounded claims on accepted decisions — bind code evidence at the green flip [adr] |
| `friction-nothing-names-which-commit-an-anchor-is-frozen-against` | friction | `asset:grounded-decisions-arc` | Grounded decisions — bind accepted ADRs to the code beneath them [arc] |
| `friction-nothing-names-which-commit-an-anchor-is-frozen-against` | friction | `doc:research/decision-source-first-drain-2026-08-24.md` | _(a repo path, not a library row)_ |
| `friction-no-verb-answers-which-capability-owns-an-owned-file` | friction | `asset:adr-0317` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr] |
| `friction-no-verb-answers-which-capability-owns-an-owned-file` | friction | `asset:adr-0270` | The claim ledger records a fiction: same-story serialisation is routed around, not paid [adr] |
| `friction-no-verb-answers-which-capability-owns-an-owned-file` | friction | `node:verification-decay-instruments` | _(a work-tree node — story or capability)_ |
| `friction-ownership-totality-only-fires-after-the-full-gate` | friction | `asset:adr-0419` | Decision support edges move to dependsOn by deprecation; an amends edge obliges an in-place annotation [adr] |
| `friction-parked-increments-are-the-population-no-freshness-check-reaches` | friction | `asset:adr-0183` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr] |
| `friction-parked-increments-are-the-population-no-freshness-check-reaches` | friction | `asset:adr-0438` | Anchor fingerprints are frozen by an explicit act, not by the acceptance transition [adr] |
| `friction-parked-increments-are-the-population-no-freshness-check-reaches` | friction | `asset:grounded-decisions-arc-inc-03` | The rebind verb and the push fence [increment] |
| `friction-queue-has-no-claim-so-adjudicator-seats-race` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `friction-queue-has-no-claim-so-adjudicator-seats-race` | friction | `doc:decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md` | The noticeboard is the claim ledger — forced session claims, presence retired [adr, now `adr-0200`] |
| `friction-read-only-verb-mutated-what-it-measured` | friction | `asset:worktree-reaper-eligibility-arc` | The worktree reaper is starved of eligibility, not broken [arc] |
| `friction-recon-sim-regex-under-read-vs-canonical-loader` | friction | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `friction-route-reason-cannot-carry-a-real-routereason-on-windows` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `friction-visual-contract-lived-outside-arc-context` | friction | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `friction-visual-contract-lived-outside-arc-context` | friction | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `friction-written-source-carries-a-raw-nul-and-grep-skips-the-file` | friction | `asset:adr-0428` | Compose at the chain frontier, per record, with an outstanding-effects marker [adr] |
| `frontend-builder` | agent | `asset:deterministic-parameterised-geometry` | Deterministic, parameterised geometry [principle] |
| `frontend-builder` | agent | `asset:observability-first` | Observability-first [principle] |
| `frontend-builder` | agent | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `frontend-builder` | agent | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `frontend-builder` | agent | `asset:prove-it-gate` | Prove-it gate [principle] |
| `frontend-builder` | agent | `asset:render-and-witness-a-flag-guarded-surface` | Render and witness a flag-guarded surface [pattern] |
| `frontend-builder` | agent | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `frontend-builder` | agent | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `frontend-builder` | agent | `asset:red-green` | red-green [principle] |
| `frontend-builder` | agent | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `frontend-builder` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `frontend-builder` | agent | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `frontend-builder` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `frontend-builder` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `frontend-builder` | agent | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `frontend-builder` | agent | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `frontend-builder` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `frontend-builder` | agent | `asset:a-green-positional-oracle-is-necessary-not-sufficient` | A green positional oracle is necessary, not sufficient [principle] |
| `frontend-builder` | agent | `asset:a-contract-that-says-observable-must-name-its-observer` | A contract that says "observable" must name its observer [principle] |
| `frontend-builder` | agent | `asset:one-element-per-signal` | One element per signal [principle] |
| `frontend-builder` | agent | `asset:de-noise-promotes-never-drops` | De-noising promotes a signal, never drops it [principle] |
| `frontend-builder` | agent | `asset:an-owner-approved-reference-is-repo-resident` | An owner-approved reference is repo-resident [principle] |
| `frontend-builder` | agent | `asset:one-way-to-do-things` | One way to do things [principle] |
| `frontend-perf-measured-on-the-vite-dev-server-misattributes-the-cost` | friction | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `frontend-perf-measured-on-the-vite-dev-server-misattributes-the-cost` | friction | `doc:decisions/0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md` | The Act 2 intro regrows the whole forest app-native; one focused tree earns authored frames [adr, now `adr-0282`] |
| `frontend-perf-measured-on-the-vite-dev-server-misattributes-the-cost` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `fr-probe-json-out-resolves-inside-packages-cli` | friction | `doc:research/amends-reach-2026-08-23.md` | _(a repo path, not a library row)_ |
| `fr-reflist-out-suggests-a-refused-set` | friction | `doc:decisions/0361-the-guidance-write-path-proves-its-own-fidelity-a-trusted-ch.md` | The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write [adr, now `adr-0361`] |
| `gate` | definition | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `gate` | definition | `asset:approval` | approval [definition] |
| `gate` | definition | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `gate` | definition | `asset:prove-it-gate` | Prove-it gate [principle] |
| `gate-aborts-early-hiding-thirteen-later-steps` | friction | `doc:decisions/0245-cross-session-signalling-addresses-the-shared-primary-checko.md` | Cross-session signalling addresses the shared primary checkout, not a session [adr, now `adr-0245`] |
| `gate-aborts-early-hiding-thirteen-later-steps` | friction | `node:noticeboard-cli` | _(a work-tree node — story or capability)_ |
| `gate-aborts-early-hiding-thirteen-later-steps` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `gate-halt-skips-the-corpus-integrity-checks` | friction | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `gate-has-no-way-to-re-run-only-the-steps-that-failed` | friction | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `gate-has-no-way-to-re-run-only-the-steps-that-failed` | friction | `doc:decisions/0304-the-gate-measures-what-a-change-affects-and-the-queue-does-t.md` | The gate measures what a change affects, and the queue does the rebasing [adr, now `adr-0304`] |
| `gate-plan-does-not-mark-its-one-deliberately-local-rung` | friction | `asset:adr-0252` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr] |
| `gate-plan-does-not-mark-its-one-deliberately-local-rung` | friction | `asset:adr-0168` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr] |
| `gate-scope-goes-full-for-a-scripts-only-manifest-edit` | friction | `asset:the-gate-costs-what-the-change-risks-arc` | The gate costs what the change risks [arc] |
| `generator-defect-lands-on-the-stage-that-has-an-instrument` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `generator-defect-lands-on-the-stage-that-has-an-instrument` | friction | `doc:decisions/0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md` | The Chapter 2 growth track animates a tree FORMING, not a sapling maturing; the owned skeleton stands on measurement [adr, now `adr-0289`] |
| `generator-defect-lands-on-the-stage-that-has-an-instrument` | friction | `doc:decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr, now `adr-0280`] |
| `gitignore-edit-forces-the-full-gate-scope` | friction | `asset:adr-0394` | A root path with proven readers narrows the affected scope; every other path still fails wide [adr] |
| `gitignore-edit-forces-the-full-gate-scope` | friction | `asset:adr-0304` | The gate measures what a change affects, and the queue does the rebasing [adr] |
| `glossary-wins` | pattern | `doc:decisions/0135-retire-docs-glossary-md-the-library-is-the-sole-term-authori.md` | Retire docs/glossary.md; the Library is the sole term authority [adr, now `adr-0135`] |
| `glossary-wins` | pattern | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `glue` | definition | `doc:decisions/0158-the-autonomous-chat-writes-only-proof-producing-work-un-prov.md` | Glue is un-asserted code within a story; the autonomous chat writes only proof-producing work, un-provable glue is escalated or earns a contract [adr, now `adr-0158`] |
| `glue` | definition | `asset:capability` | capability [definition] |
| `glue` | definition | `asset:contract` | contract [definition] |
| `glue` | definition | `asset:story` | story [definition] |
| `glue` | definition | `asset:operator-attested` | operator-attested [definition] |
| `glue-worker` | agent | `asset:glue` | glue [definition] |
| `glue-worker` | agent | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `glue-worker` | agent | `asset:deep-modules` | Deep modules [principle] |
| `glue-worker` | agent | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `glue-worker` | agent | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `glue-worker` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `glue-worker` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `glue-worker` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `glue-worker` | agent | `asset:the-same-file-in-another-tree-is-a-different-file` | The same file in another tree is a different file [principle] |
| `graduate-park-reason-ignores-at-path-and-overwrites-the-prior-verdict` | friction | `doc:decisions/0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md` | Parked-memory leases: the graduation worklist counts only new, changed, or lease-expired candidates [adr, now `adr-0202`] |
| `graduate-park-reason-ignores-at-path-and-overwrites-the-prior-verdict` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `graduation-synthesist` | agent | `asset:friction-adjudication` | Friction adjudication [process] |
| `graduation-synthesist` | agent | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `graduation-synthesist` | agent | `asset:signal-and-noise` | Signal and noise [principle] |
| `graduation-synthesist` | agent | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `graduation-synthesist` | agent | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `graduation-synthesist` | agent | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `graduation-synthesist` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `graduation-synthesist` | agent | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `graduation-synthesist` | agent | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `graduation-synthesist` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `graduation-synthesist` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `graduation-synthesist` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `graduation-synthesist` | agent | `asset:corpus-investigator` | corpus-investigator [agent] |
| `graduation-synthesist` | agent | `asset:guidance-curator` | guidance-curator [agent] |
| `graduation-synthesist` | agent | `asset:story-author` | story-author [agent] |
| `graduation-synthesist` | agent | `asset:librarian-curator` | librarian-curator [agent] |
| `graduation-synthesist` | agent | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `graduation-synthesist` | agent | `asset:price-the-deferral` | Price the deferral [principle] |
| `green-builder` | agent | `asset:prove-it-gate` | Prove-it gate [principle] |
| `green-builder` | agent | `asset:red-green` | red-green [principle] |
| `green-builder` | agent | `asset:spine-sequences-leaf-judges` | The spine sequences, the leaf judges [principle] |
| `green-builder` | agent | `asset:deep-modules` | Deep modules [principle] |
| `green-builder` | agent | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `green-builder` | agent | `asset:baseline-preservation` | Baseline preservation [principle] |
| `green-builder` | agent | `asset:dogfood-fix-the-source` | Dogfood: fix the source [principle] |
| `green-builder` | agent | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `green-builder` | agent | `asset:reward-hacking` | Reward hacking [principle] |
| `green-builder` | agent | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `green-builder` | agent | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `green-builder` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `green-builder` | agent | `asset:tightening-a-shared-contract-needs-a-full-sweep` | Tightening a shared contract needs a full sweep [principle] |
| `green-builder` | agent | `asset:no-proof-preservation` | No proof preservation [principle] |
| `grepping-a-constants-content-misses-the-test-that-binds-it` | friction | `node:context-traversal-capture` | _(a work-tree node — story or capability)_ |
| `grounded-art-machinery-arc` | arc | `ADR-0214` | _(malformed — no recognised prefix)_ |
| `grounded-art-machinery-arc` | arc | `ADR-0069` | _(malformed — no recognised prefix)_ |
| `grounded-art-machinery-arc` | arc | `ADR-0070` | _(malformed — no recognised prefix)_ |
| `grounded-art-machinery-arc` | arc | `ADR-0093` | _(malformed — no recognised prefix)_ |
| `grow-tell-roam-ask` | definition | `asset:adr-0453` | The website is marketing over a real forest snapshot, and it stops at the capability tree [adr] |
| `grow-tell-roam-ask` | definition | `asset:website-refresh-arc` | The website refresh: the real forest carries the pitch [arc] |
| `grow-tell-roam-ask` | definition | `asset:the-reader-chooses-the-thread-and-the-depth` | The reader chooses the thread and the depth [principle] |
| `guidance-curator` | agent | `asset:signal-and-noise` | Signal and noise [principle] |
| `guidance-curator` | agent | `asset:guidance-quality` | Guidance quality [principle] |
| `guidance-curator` | agent | `asset:deep-modules` | Deep modules [principle] |
| `guidance-curator` | agent | `asset:survival-test-for-adrs` | The survival test for ADRs [principle] |
| `guidance-curator` | agent | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `guidance-curator` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `guidance-curator` | agent | `asset:least-authority-tool-grants` | Least-authority tool grants [principle] |
| `guidance-curator` | agent | `asset:two-consumer-extraction` | Two-consumer extraction [principle] |
| `guidance-curator` | agent | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `guidance-curator` | agent | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `guidance-curator` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `guidance-curator` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `guidance-curator` | agent | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `guidance-curator` | agent | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `guidance-curator` | agent | `asset:untrusted-input-is-not-instruction` | Untrusted input is not instruction [principle] |
| `guidance-curator` | agent | `asset:state-the-principle-not-the-mechanics` | State the principle, not the mechanics [principle] |
| `guidance-curator` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `guidance-quality` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `headless-blender-silently-writes-nothing-on-a-relative-path` | friction | `doc:decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr, now `adr-0280`] |
| `heredoc-authored-probe-silently-matched-nothing` | friction | `doc:decisions/0278-a-fifth-verification-decay-instrument-an-injected-seam-whose.md` | A fifth verification-decay instrument: an injected seam whose default no test exercises [adr, now `adr-0278`] |
| `human-owns-the-outer-loop` | guardrail | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `human-owns-the-outer-loop` | guardrail | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `asset:a-live-only-guarantee-is-an-honesty-gap` | A live-only-provable guarantee is an honesty gap [principle] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `asset:operator-attested` | operator-attested [definition] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `asset:uat-proves-the-goal-not-the-surface` | UAT proves the goal, not the surface [principle] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0184-machine-witness-drive-machinery-s-three-live-uat-legs.md` | Machine-witness drive-machinery's three live UAT legs [adr, now `adr-0184`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md` | Proof paints the world — verdict-derived green and the human-witness signpost [adr, now `adr-0040`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0044-per-uat-test-human-attestation.md` | Per-UAT-test human attestation — the owner's "I saw it work" as signal [adr, now `adr-0044`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md` | The adopt pass resolves each UAT leg's witness — machine only when a real test covers it, else human — and OQs gate the proving process [adr, now `adr-0106`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `human-witness-is-a-judgment-gap-not-cost` | principle | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `identity-keyed-randomness-needs-a-real-avalanche-mix` | friction | `doc:decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md` | Chapter 2 organic art is code-generated: code owns skeleton, camera and growth; models supply components [adr, now `adr-0280`] |
| `implementer-shortcut-patterns` | pattern | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `implementer-shortcut-patterns` | pattern | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `implementer-shortcut-patterns` | pattern | `asset:reward-hacking` | Reward hacking [principle] |
| `implementer-shortcut-patterns` | pattern | `asset:mock-uat-seam` | mock-UAT seam [definition] |
| `implement-phase-fence-blocks-in-scope-test-fixtures` | friction | `asset:friction-contract-asserts-type-beyond-real-scope` | A contract asserting a type-level change the leaf's real: scope cannot reach signs green while structurally undelivered [friction] |
| `implement-phase-fence-blocks-in-scope-test-fixtures` | friction | `asset:friction-cap-covers-outside-real-scope-burns-leaf-run` | A contract that covers a file outside its cap's real write scope burns a full leaf run before failing closed [friction] |
| `increment-add-dual-writes-prose-and-only-one-copy-is-editable` | friction | `doc:decisions/0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md` | Arcs hold increments: one durable typed tier replaces increments, proposals and plans [adr, now `adr-0305`] |
| `increment-add-dual-writes-prose-and-only-one-copy-is-editable` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `increment-add-dual-writes-prose-and-only-one-copy-is-editable` | friction | `asset:arcs-hold-increments-arc` | Arcs hold increments [arc] |
| `increment-closure-prose-contradicts-live-arc-state` | friction | `doc:decisions/0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md` | The knowledge DAG is an authored standsOn edge, not the citation web [adr, now `adr-0223`] |
| `increment-fence-falsified-by-ceiling-bound-corpus-rungs` | friction | `doc:decisions/0404-dispatching-a-build-is-a-cli-verb-retire-the-in-app-build-an.md` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr, now `adr-0404`] |
| `increment-implementation-shape-unchecked-against-its-seam` | friction | `node:noticeboard-cli` | _(a work-tree node — story or capability)_ |
| `increment-implementation-shape-unchecked-against-its-seam` | friction | `doc:decisions/0368-the-claim-broker-holds-the-credential-the-sandbox-may-not-an.md` | The claim broker holds the credential the sandbox may not, and derives identity Git cannot be lied to about [adr, now `adr-0368`] |
| `in-session-subagent` | definition | `doc:decisions/0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md` | Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write [adr, now `adr-0137`] |
| `in-session-subagent` | definition | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `in-session-subagent` | definition | `asset:session-cutting` | session cutting [definition] |
| `in-session-subagent` | definition | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `in-session-subagent` | definition | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `in-session-subagent` | definition | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `isometric-art-geometry-libraries` | techstack | `ADR-0214` | _(malformed — no recognised prefix)_ |
| `isometric-art-geometry-libraries` | techstack | `ADR-0069` | _(malformed — no recognised prefix)_ |
| `journey-principle` | principle | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `journey-principle` | principle | `doc:decisions/0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md` | Cross-story dependency direction, the no-cycle rule, and the brownfield exit hatch [adr, now `adr-0058`] |
| `journey-principle` | principle | `asset:deep-modules` | Deep modules [principle] |
| `journey-principle` | principle | `asset:splitting-rule` | The splitting rule [principle] |
| `journey-principle` | principle | `asset:cross-story-dependency` | Cross-story dependency direction and the no-cycle rule [principle] |
| `justify-a-gate-rung` | process | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `justify-a-gate-rung` | process | `doc:decisions/0304-the-gate-measures-what-a-change-affects-and-the-queue-does-t.md` | The gate measures what a change affects, and the queue does the rebasing [adr, now `adr-0304`] |
| `justify-a-gate-rung` | process | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `justify-a-gate-rung` | process | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `justify-a-gate-rung` | process | `asset:a-probe-cannot-falsify-the-predicate-it-borrows` | A probe cannot falsify the predicate it borrows [principle] |
| `justify-a-gate-rung` | process | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `justify-a-gate-rung` | process | `asset:gate` | gate [definition] |
| `justify-a-gate-rung` | process | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `kit-island-reproduce-command-names-an-uncommitted-asset` | friction | `doc:research/chapter2-kit-island-2026-08-28/README.md` | _(a repo path, not a library row)_ |
| `label-join-failure-prints-a-full-table` | friction | `asset:adr-0428` | Compose at the chain frontier, per record, with an outstanding-effects marker [adr] |
| `label-join-failure-prints-a-full-table` | friction | `doc:research/decision-altitude-2026-08-23.md` | _(a repo path, not a library row)_ |
| `landed-cli-sources-bound-to-no-capability` | friction | `asset:codex-factory-parity-arc` | Codex factory parity [arc] |
| `landed-cli-sources-bound-to-no-capability` | friction | `node:noticeboard-cli` | _(a work-tree node — story or capability)_ |
| `launch-desktop` | process | `doc:decisions/0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md` | A native credential-host desktop client (Electron) for BYO-credential delivery [adr, now `adr-0109`] |
| `launch-desktop` | process | `doc:decisions/0111-desktop-client-step-1-lands-as-the-apps-desktop-surface-and.md` | Desktop client Step 1 lands as the apps/desktop surface and stories/desktop story [adr, now `adr-0111`] |
| `launch-desktop` | process | `doc:decisions/0179-desktop-credentials-are-configurable-through-the-storytree-u.md` | Desktop credentials are configurable through the Storytree UI [adr, now `adr-0179`] |
| `launch-desktop` | process | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `launch-desktop` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `launch-desktop` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `launch-desktop` | process | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `launch-studio` | process | `doc:decisions/0042-hosted-studio-demo-cloud-run-iap.md` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr, now `adr-0042`] |
| `launch-studio` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `launch-studio` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `launch-studio` | process | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `launch-studio` | process | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `leaf-step-leaf-judgment` | definition | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `leaf-step-leaf-judgment` | definition | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `leaf-step-leaf-judgment` | definition | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `leaf-step-leaf-judgment` | definition | `asset:spine` | spine [definition] |
| `leaf-step-leaf-judgment` | definition | `asset:contract` | contract [definition] |
| `least-authority-tool-grants` | principle | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `least-authority-tool-grants` | principle | `doc:decisions/0029-agents-as-library-artifact-category.md` | The agent roster is a Library artifact category (`agent` kind) [adr, now `adr-0029`] |
| `least-authority-tool-grants` | principle | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `legible-at-the-resting-view` | principle | `asset:observability-first` | Observability-first [principle] |
| `legible-at-the-resting-view` | principle | `asset:decide-against-a-standard-not-a-budget` | Decide against a standard, not a budget [principle] |
| `legible-at-the-resting-view` | principle | `asset:one-element-per-signal` | One element per signal [principle] |
| `legible-at-the-resting-view` | principle | `doc:decisions/0062-the-forest-world-is-the-observability-layer-rendered-one-art.md` | The forest world is the observability layer rendered: one art element per signal [adr, now `adr-0062`] |
| `legible-at-the-resting-view` | principle | `doc:decisions/0367-chapter-2-s-land-is-rendered-in-blender-too-an-angled-citybu.md` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr, now `adr-0367`] |
| `legible-at-the-resting-view` | principle | `asset:adr-0471` | Both maps open on a designed resting frame, pinned to island size [adr] |
| `legible-at-the-resting-view` | principle | `asset:frontend-appearance-repair-arc` | The forest map is legible again, and the instruments that judge it are honest [arc] |
| `librarian-curator` | agent | `asset:standalone-resilient-library` | Standalone-resilient library [pattern] |
| `librarian-curator` | agent | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `librarian-curator` | agent | `asset:signal-and-noise` | Signal and noise [principle] |
| `librarian-curator` | agent | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `librarian-curator` | agent | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `librarian-curator` | agent | `asset:two-consumer-extraction` | Two-consumer extraction [principle] |
| `librarian-curator` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `librarian-curator` | agent | `asset:glossary-wins` | When a term is in question, the definition artifact wins [pattern] |
| `librarian-curator` | agent | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `librarian-curator` | agent | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `librarian-curator` | agent | `asset:guidance-quality` | Guidance quality [principle] |
| `librarian-curator` | agent | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `librarian-curator` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `librarian-curator` | agent | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `librarian-curator` | agent | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `librarian-curator` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `librarian-curator` | agent | `asset:friction-adjudication` | Friction adjudication [process] |
| `librarian-curator` | agent | `asset:citing-a-document-is-not-reading-it` | Citing a document is not reading it [principle] |
| `library` | definition | `doc:decisions/0017-cross-cutting-knowledge-tier.md` | The cross-cutting knowledge tier (resolves open-q §9) [adr, now `adr-0017`] |
| `library` | definition | `doc:decisions/0018-knowledge-tier-phase1-structured-source.md` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr, now `adr-0018`] |
| `library` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `library` | definition | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `library` | definition | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `library` | definition | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `library` | definition | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `library` | definition | `asset:story-tree` | story tree [definition] |
| `library` | definition | `asset:noticeboard` | noticeboard [definition] |
| `library` | definition | `asset:studio` | studio [definition] |
| `library` | definition | `asset:adr` | ADR [definition] |
| `library` | definition | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `library-edit-ceremony` | process | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `library-edit-ceremony` | process | `doc:decisions/0017-cross-cutting-knowledge-tier.md` | The cross-cutting knowledge tier (resolves open-q §9) [adr, now `adr-0017`] |
| `library-edit-ceremony` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `library-edit-ceremony` | process | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `library-edit-ceremony` | process | `doc:decisions/0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md` | The agent tier goes live-canonical: the committed seed stops being an authoring surface [adr, now `adr-0307`] |
| `library-edit-ceremony` | process | `doc:decisions/0260-a-followed-edge-needs-an-offer-it-can-be-joined-to-and-order.md` | A followed edge needs an offer it can be joined to, and ordering cannot supply it [adr, now `adr-0260`] |
| `library-edit-ceremony` | process | `doc:decisions/0320-following-a-library-pointer-means-pasting-the-offered-form-t.md` | Following a Library pointer means pasting the offered form: the decision tree's thinness is guidance debt [adr, now `adr-0320`] |
| `library-edit-ceremony` | process | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `library-edit-ceremony` | process | `asset:library` | library [definition] |
| `library-only-edit-has-no-claimable-node` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `library-only-edit-has-no-claimable-node` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `library-tech-tree-overlay-arc` | arc | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-1` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-2` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-3` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-4` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-5` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-6` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-7` | increment | `doc:decisions/0187-the-library-overlay-is-a-permanent-lens-with-an-open-documen.md` | The library overlay is a permanent lens with an Open document overlay, and the overview renders the mockup's load-bearing information design [adr, now `adr-0187`] |
| `library-tech-tree-overlay-plan-7` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-8` | increment | `doc:decisions/0187-the-library-overlay-is-a-permanent-lens-with-an-open-documen.md` | The library overlay is a permanent lens with an Open document overlay, and the overview renders the mockup's load-bearing information design [adr, now `adr-0187`] |
| `library-tech-tree-overlay-plan-8` | increment | `doc:decisions/0185-library-as-a-tech-tree-overlay-on-the-forest-map.md` | Library as a tech-tree overlay on the forest map [adr, now `adr-0185`] |
| `library-tech-tree-overlay-plan-8` | increment | `asset:library-tech-tree-overlay-arc` | Library as a tech-tree overlay on the forest map [arc] |
| `lifecycle-status` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `lifecycle-status` | definition | `asset:proof-mode` | Proof mode [definition] |
| `lifecycle-status` | definition | `asset:node-rollup` | node rollup [definition] |
| `lifecycle-status` | definition | `asset:proof-hash` | proof hash [definition] |
| `lifecycle-status` | definition | `asset:evidence` | evidence [definition] |
| `lifecycle-status` | definition | `asset:operator-attested` | operator-attested [definition] |
| `lifecycle-status` | definition | `asset:prove-it-gate` | Prove-it gate [principle] |
| `linked-session-context-plan-1` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `linked-session-context-plan-1` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `linked-session-context-plan-1` | increment | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `linked-session-context-plan-1` | increment | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `linked-session-context-plan-1` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `linked-session-context-plan-2` | increment | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `linked-session-context-plan-2` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `linked-session-context-plan-2` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `linked-session-context-plan-2` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `linked-session-context-plan-2` | increment | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `linked-session-context-plan-2` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `linked-session-context-plan-3` | increment | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `linked-session-context-plan-3` | increment | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `linked-session-context-plan-3` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `linked-session-context-plan-4` | increment | `doc:docs/decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `linked-session-context-plan-4` | increment | `doc:docs/decisions/0241-context-traversal-traces-persist-locally-per-session-unretai.md` | Context traversal traces persist locally per session, unretained and version-pinned [adr, now `adr-0241`] |
| `linked-session-context-plan-4` | increment | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `linked-session-context-plan-5` | increment | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `linked-session-context-plan-5` | increment | `asset:cross-story-dependency` | Cross-story dependency direction and the no-cycle rule [principle] |
| `linked-session-context-plan-5` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `linked-session-context-plan-5` | increment | `asset:glue` | glue [definition] |
| `linked-session-context-plan-5` | increment | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `linked-session-context-plan-5` | increment | `doc:0235-record-context-traversal-at-deterministic-runtime-boundari.md` | _(a repo path, not a library row)_ |
| `linked-session-context-plan-5` | increment | `doc:0241` | _(a repo path, not a library row)_ |
| `linked-session-context-plan-5` | increment | `doc:0243` | _(a repo path, not a library row)_ |
| `linked-session-context-plan-5` | increment | `doc:0158` | _(a repo path, not a library row)_ |
| `linked-session-context-plan-5` | increment | `doc:0192` | _(a repo path, not a library row)_ |
| `linked-session-context-plan-7` | increment | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `linked-session-context-plan-7` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `linked-session-context-plan-7` | increment | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `linked-session-context-plan-7` | increment | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `linked-session-context-plan-8` | increment | `docs/decisions/0243-a-live-spend-only-adapter-earns-its-activation-leg-by-seam-a.md` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `docs/decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `docs/decisions/0247 — machine when a compiler exists, even with no harness yet` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `docs/decisions/0158 — glue: un-asserted connective code within a story` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `docs/decisions/0087 — a write-scope glob names ONE concrete package` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `docs/decisions/0130 — turn-cap budget vocabulary` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `stories/context-traversal-spawn/story.md — Declared boundaries (the cycle fence)` | _(malformed — no recognised prefix)_ |
| `linked-session-context-plan-8` | increment | `asset:linked-session-context-arc` | Session context traversal — observable paths and guided depth [arc] |
| `lint-lane-sized-by-count-not-by-what-the-rule-actually-flags` | friction | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `lint-lane-sized-by-count-not-by-what-the-rule-actually-flags` | friction | `asset:anti-slop-adoption-arc-inc-03` | The uncontested lane — chained assertions and known-value widening to zero, then error [increment] |
| `lint-lane-sized-by-count-not-by-what-the-rule-actually-flags` | friction | `asset:anti-slop-adoption-arc-inc-08` | Adjudicate no-known-value-widening — mis-sorted as cheap, 57% of it is a house-style question [increment] |
| `lint-lane-sized-by-count-not-by-what-the-rule-actually-flags` | friction | `doc:decisions/0407-adopt-the-anti-slop-rule-set-as-the-house-typescript-standar.md` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr, now `adr-0407`] |
| `linux-onboarding-assumes-apt-and-sudo-the-box-never-needed` | friction | `doc:machine-onboarding.md` | _(a repo path, not a library row)_ |
| `live-agent-projection-drift-reds-unrelated-gate-2026-08-06` | friction | `node:act2-regrow-camera-zoom-out` | _(a work-tree node — story or capability)_ |
| `live-claim-classification-cannot-rule-out-a-corpse` | friction | `asset:linked-session-context-arc-inc-28` | Mint the two decision-read capabilities so the files can be claimed [increment] |
| `live-claim-classification-cannot-rule-out-a-corpse` | friction | `node:context-traversal-transcript` | _(a work-tree node — story or capability)_ |
| `live-store-is-the-edit-surface` | guardrail | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `live-store-is-the-edit-surface` | guardrail | `doc:decisions/0017-cross-cutting-knowledge-tier.md` | The cross-cutting knowledge tier (resolves open-q §9) [adr, now `adr-0017`] |
| `live-store-is-the-edit-surface` | guardrail | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `load-bearing-measurement-shipped-without-its-instrument` | friction | `doc:research/bun-runtime-probe-2026-08-22.md` | _(a repo path, not a library row)_ |
| `load-bearing-measurement-shipped-without-its-instrument` | friction | `asset:bun-runtime-migration-arc` | Bun becomes the runtime, one package at a time [arc] |
| `machine-in-the-loop-is-the-default-human-is-the-exception` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `machine-in-the-loop-is-the-default-human-is-the-exception` | principle | `asset:operator-attested` | operator-attested [definition] |
| `manifest-json-roundtrip-destroys-hand-formatting` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `map-art-swap-must-resolve-through-the-sprite-sheet` | friction | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `map-art-swap-must-resolve-through-the-sprite-sheet` | friction | `doc:decisions/0292-every-island-grows-the-owner-s-exp-16-tree-from-one-shared-t.md` | Every island grows the owner's exp-16 tree from one shared track, varied by code, and no motion survives the settle [adr, now `adr-0292`] |
| `map-art-swap-must-resolve-through-the-sprite-sheet` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `meaning-outranks-appearance` | principle | `asset:one-element-per-signal` | One element per signal [principle] |
| `meaning-outranks-appearance` | principle | `asset:de-noise-promotes-never-drops` | De-noising promotes a signal, never drops it [principle] |
| `meaning-outranks-appearance` | principle | `asset:observability-first` | Observability-first [principle] |
| `meaning-outranks-appearance` | principle | `asset:legible-at-the-resting-view` | Legible at the resting view [principle] |
| `meaning-outranks-appearance` | principle | `doc:decisions/0062-the-forest-world-is-the-observability-layer-rendered-one-art.md` | The forest world is the observability layer rendered: one art element per signal [adr, now `adr-0062`] |
| `meaning-outranks-appearance` | principle | `doc:decisions/0367-chapter-2-s-land-is-rendered-in-blender-too-an-angled-citybu.md` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr, now `adr-0367`] |
| `measurement-probes-separate-activity-from-bucket-axis` | friction | `node:camera-rasterisation-probe` | _(a work-tree node — story or capability)_ |
| `measurement-probes-separate-activity-from-bucket-axis` | friction | `doc:research/act2-camera-rasterisation-2026-08-05/camera-rasterisation.json` | _(a repo path, not a library row)_ |
| `measure-session-cost-from-transcripts` | process | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `measure-session-cost-from-transcripts` | process | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `measure-session-cost-from-transcripts` | process | `asset:observability-first` | Observability-first [principle] |
| `mechanical-red-redrive-brief` | pattern | `asset:right-kind-red` | The red must be the right kind [guardrail] |
| `mechanical-red-redrive-brief` | pattern | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `mechanical-red-redrive-brief` | pattern | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `mechanical-red-redrive-brief` | pattern | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `mechanical-red-redrive-brief` | pattern | `asset:prove-it-gate` | Prove-it gate [principle] |
| `mechanical-red-redrive-brief` | pattern | `doc:decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr, now `adr-0057`] |
| `mechanical-red-redrive-brief` | pattern | `doc:decisions/0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md` | Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test [adr, now `adr-0126`] |
| `mechanical-red-redrive-brief` | pattern | `doc:decisions/0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md` | Record per-contract coverage on the signed verdict shape (ADR-0122 Option A) [adr, now `adr-0127`] |
| `mechanical-red-redrive-brief` | pattern | `doc:decisions/0122-per-contract-coverage-check-map-each-declared-contract-to-an.md` | Per-contract coverage check: map each declared contract to an observed test [adr, now `adr-0122`] |
| `mechanical-waiting-never-pays-context-rent` | principle | `doc:decisions/0323-session-cost-is-input-side-context-rent-not-output.md` | Session cost is input-side context rent, not output [adr, now `adr-0323`] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:merge-ceremony` | Merge ceremony [process] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:an-awaited-notification-is-not-a-turn-ending-state` | An awaited notification is never a turn-ending state [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:a-probe-cannot-falsify-the-predicate-it-borrows` | A probe cannot falsify the predicate it borrows [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `mechanical-waiting-never-pays-context-rent` | principle | `doc:decisions/0303-an-escalation-is-a-landing-event-a-blocked-session-lands-its.md` | An escalation is a landing event: a blocked session lands its state and releases its claims [adr, now `adr-0303`] |
| `memory-branch-stamp-guidance-alone-has-not-moved-adoption` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `memory-branch-stamp-guidance-alone-has-not-moved-adoption` | friction | `asset:memory-branch-stamp-adoption-is-unmeasured` | The memory branch-stamp has no enforcer, so its adoption is unmeasured [increment] |
| `merge-ceremony` | process | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `merge-ceremony` | process | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `merge-ceremony` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `merge-ceremony` | process | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `merge-ceremony` | process | `asset:trunk` | trunk [definition] |
| `merge-ceremony` | process | `asset:approval-gated-trunk` | Approval-gated trunk [guardrail] |
| `merge-ceremony` | process | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `merge-ceremony` | process | `doc:decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md` | Branch dies on merge; the wisp survives via claim-at-declare [adr, now `adr-0142`] |
| `merge-ceremony` | process | `doc:decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr, now `adr-0271`] |
| `merge-ceremony` | process | `doc:decisions/0275-sessions-may-continue-past-merge-the-unit-ends-ending-the-se.md` | Sessions may continue past merge: the unit ends; ending the session is an orchestration call [adr, now `adr-0275`] |
| `merge-ceremony` | process | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `merge-ceremony` | process | `doc:decisions/0303-an-escalation-is-a-landing-event-a-blocked-session-lands-its.md` | An escalation is a landing event: a blocked session lands its state and releases its claims [adr, now `adr-0303`] |
| `merge-ceremony` | process | `doc:decisions/0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md` | The arc surface is momentum lanes with a briefing panel: bars are units not time, blocked is stuck not answerable [adr, now `adr-0314`] |
| `merge-ceremony` | process | `doc:decisions/0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md` | Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen [adr, now `adr-0335`] |
| `merge-ceremony` | process | `doc:decisions/0337-an-agent-may-reopen-a-closed-arc-arc-reopen-records-why-then.md` | An agent may reopen a closed arc: arc reopen records why, then flips the bit [adr, now `adr-0337`] |
| `merge-ceremony` | process | `doc:decisions/0347-arc-close-refuses-over-open-increments-draining-the-work-is.md` | arc close refuses over open increments: draining the work is the closing act [adr, now `adr-0347`] |
| `meter-fail-closed-caps-in-real-cost` | principle | `doc:decisions/0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr, now `adr-0130`] |
| `meter-fail-closed-caps-in-real-cost` | principle | `doc:decisions/0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr, now `adr-0131`] |
| `meter-fail-closed-caps-in-real-cost` | principle | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `meter-fail-closed-caps-in-real-cost` | principle | `asset:per-node-budget` | per-node budget [definition] |
| `mock-uat-seam` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `mock-uat-seam` | definition | `asset:boundary` | boundary [definition] |
| `mock-uat-seam` | definition | `asset:uat` | UAT [definition] |
| `mock-uat-seam` | definition | `asset:contract-test` | contract test [definition] |
| `mock-uat-seam` | definition | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `model-uat-promotion` | arc | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `model-uat-promotion` | arc | `asset:uat` | UAT [definition] |
| `model-uat-promotion` | arc | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `mutation-remedy-omits-deleting-the-unobservable-branch` | friction | `asset:adr-0458` | Build the diff-scoped mutation rung on the patched plugin, and report the defects upstream in parallel [adr] |
| `mutation-remedy-omits-deleting-the-unobservable-branch` | friction | `asset:adr-0447` | Test strength is a second axis, measured mechanically — red-green stays [adr] |
| `mutation-rung-reports-a-killed-mutant-as-survived` | friction | `asset:test-strength-beyond-red-green-arc` | Test strength beyond red-green [arc] |
| `mutation-rung-unproven-reds-only-on-ci` | friction | `doc:research/stryker-bun-attribution-2026-08-26.md` | _(a repo path, not a library row)_ |
| `native-windows-deny-read-does-not-contain-shell-subprocesses` | friction | `doc:decisions/0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md` | Interactive Codex writes only in its current claimed worktree [adr, now `adr-0355`] |
| `never-bypass-the-gate` | guardrail | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `never-bypass-the-gate` | guardrail | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `never-chain-type-assertions` | guardrail | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `never-chain-type-assertions` | guardrail | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `never-hide-omission-in-an-empty-spread` | guardrail | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `never-hide-omission-in-an-empty-spread` | guardrail | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `never-mock-a-module-name-the-seam` | guardrail | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `never-mock-a-module-name-the-seam` | guardrail | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `never-widen-a-value-you-already-know` | guardrail | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `never-widen-a-value-you-already-know` | guardrail | `asset:anti-slop-adoption-arc` | House TypeScript standard — every anti-slop rule is on at error or refused in writing [arc] |
| `new-package-proof-command-passes-vacuously-so-confirm-red-halts` | friction | `doc:decisions/0158-the-autonomous-chat-writes-only-proof-producing-work-un-prov.md` | Glue is un-asserted code within a story; the autonomous chat writes only proof-producing work, un-provable glue is escalated or earns a contract [adr, now `adr-0158`] |
| `new-package-proof-command-passes-vacuously-so-confirm-red-halts` | friction | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `new-source-file-ownership-is-only-announced-by-a-full-gate` | friction | `node:context-window-meter` | _(a work-tree node — story or capability)_ |
| `new-source-file-ownership-is-only-announced-by-a-full-gate` | friction | `asset:make-the-single-window-meter-useful` | Make the single-window context meter useful enough to judge the second lane against [increment] |
| `new-table-in-schema-breaks-live-reads-till-ddl` | friction | `asset:adr-0446` | The write-scope refusal sink: one per-slice scope-event stream, armed-and-silent recorded as a zero [adr] |
| `new-table-in-schema-breaks-live-reads-till-ddl` | friction | `asset:spine-wall-measurement-arc` | Measure whether the spine's walls ever fire [arc] |
| `no-arc-new-scaffolder-verb` | friction | `asset:arc` | Arc [definition] |
| `no-authoring-verb-for-a-new-seed-artifact` | friction | `asset:affected-pr-test-scope` | Affected-only PR test scope [process] |
| `no-authoring-verb-for-a-new-seed-artifact` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `no-claim-without-evidence` | principle | `asset:reward-hacking` | Reward hacking [principle] |
| `no-claim-without-evidence` | principle | `asset:verification-wins` | verification-wins [principle] |
| `no-claim-without-evidence` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `node` | definition | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `node` | definition | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `node` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `node` | definition | `asset:run` | run [definition] |
| `node` | definition | `asset:dag` | DAG [definition] |
| `node-rollup` | definition | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `node-rollup` | definition | `asset:event-log` | event log [definition] |
| `node-rollup` | definition | `asset:event` | event [definition] |
| `node-rollup` | definition | `asset:verdict` | verdict [definition] |
| `no-harness-exercises-a-check-under-cis-checkout-shape` | friction | `asset:adr-0458` | Build the diff-scoped mutation rung on the patched plugin, and report the defects upstream in parallel [adr] |
| `no-harness-exercises-a-check-under-cis-checkout-shape` | friction | `asset:mutation-rung-in-ci` | Wire the mutation rung into CI so it actually blocks a merge [increment] |
| `no-headless-route-to-the-studio-story-panel` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `no-proof-preservation` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `no-proof-preservation` | principle | `asset:proof-hash` | proof hash [definition] |
| `no-test-runner-names-its-files-on-a-green-run` | friction | `doc:research/bun-runtime-probe-2026-08-22.md` | _(a repo path, not a library row)_ |
| `no-test-runner-names-its-files-on-a-green-run` | friction | `asset:bun-runtime-migration-arc` | Bun becomes the runtime, one package at a time [arc] |
| `noticeboard` | definition | `doc:decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md` | The noticeboard is the claim ledger — forced session claims, presence retired [adr, now `adr-0200`] |
| `noticeboard` | definition | `doc:decisions/0033-session-presence-notice-board.md` | The notice board is session presence — advisory coordination for parallel sessions [adr, now `adr-0033`] |
| `noticeboard` | definition | `doc:decisions/0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md` | Per-unit write-claim refuses a second concurrent build of one unit [adr, now `adr-0121`] |
| `noticeboard` | definition | `doc:decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md` | The wisp is a forced, CI-cleared story-claim — one coordination and observability layer [adr, now `adr-0138`] |
| `noticeboard` | definition | `doc:decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md` | Branch dies on merge; the wisp survives via claim-at-declare [adr, now `adr-0142`] |
| `noticeboard` | definition | `doc:decisions/0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md` | Undeclared-session nudge — SessionStart injects the anchor prompt and the gate warns [adr, now `adr-0143`] |
| `noticeboard` | definition | `doc:decisions/0032-cite-graduation-mechanism.md` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr, now `adr-0032`] |
| `noticeboard` | definition | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `noticeboard` | definition | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `noticeboard` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `noticeboard` | definition | `doc:decisions/0017-cross-cutting-knowledge-tier.md` | The cross-cutting knowledge tier (resolves open-q §9) [adr, now `adr-0017`] |
| `noticeboard` | definition | `doc:decisions/0015-gcp-hosting-cloud-sql-event-store.md` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr, now `adr-0015`] |
| `noticeboard` | definition | `asset:library` | library [definition] |
| `noticeboard` | definition | `asset:story-tree` | story tree [definition] |
| `noticeboard` | definition | `asset:prove-it-gate` | Prove-it gate [principle] |
| `noticeboard-declare-exits-0-while-leaving-unclaimed` | friction | `asset:noticeboard` | noticeboard [definition] |
| `noticeboard-declare-exits-0-while-leaving-unclaimed` | friction | `asset:claim` | claim [definition] |
| `no-verb-answers-an-ad-hoc-question-of-the-live-store` | friction | `asset:library` | library [definition] |
| `no-verb-answers-an-ad-hoc-question-of-the-live-store` | friction | `asset:arc` | Arc [definition] |
| `no-verb-answers-who-holds-a-work-claim-on-this-file` | friction | `node:notice-board` | _(a work-tree node — story or capability)_ |
| `no-verb-applies-the-schema-ddl-and-nothing-else` | friction | `node:noticeboard-cli` | _(a work-tree node — story or capability)_ |
| `no-verb-reads-an-artifacts-raw-field-text` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `no-verb-reads-an-artifacts-raw-field-text` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `no-way-to-measure-a-served-api-routes-payload-from-a-worktree` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `no-way-to-measure-a-served-api-routes-payload-from-a-worktree` | friction | `node:arc-orientation-lens` | _(a work-tree node — story or capability)_ |
| `no-way-to-measure-a-served-api-routes-payload-from-a-worktree` | friction | `node:serve-mode` | _(a work-tree node — story or capability)_ |
| `observability-first` | principle | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `observability-first` | principle | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `one-element-per-signal` | principle | `asset:observability-first` | Observability-first [principle] |
| `one-element-per-signal` | principle | `doc:decisions/0062-the-forest-world-is-the-observability-layer-rendered-one-art.md` | The forest world is the observability layer rendered: one art element per signal [adr, now `adr-0062`] |
| `one-element-per-signal` | principle | `doc:decisions/0036-story-world-studio-visualisation.md` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr, now `adr-0036`] |
| `one-element-per-signal` | principle | `doc:decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md` | Proof paints the world — verdict-derived green and the human-witness signpost [adr, now `adr-0040`] |
| `one-model-boundary` | guardrail | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `one-way-to-do-things` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `one-way-to-do-things` | principle | `asset:deep-modules` | Deep modules [principle] |
| `only-the-tool-route-is-fenced-so-a-library-route-archives-unbuilt` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `only-the-tool-route-is-fenced-so-a-library-route-archives-unbuilt` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `only-the-tool-route-is-fenced-so-a-library-route-archives-unbuilt` | friction | `node:feedback-graduation` | _(a work-tree node — story or capability)_ |
| `opaque-pixel-floor-cannot-see-a-prop-that-stopped-drawing` | friction | `doc:research/chapter2-island-flowers-and-tree-2026-08-20/README.md` | _(a repo path, not a library row)_ |
| `operator-attested` | definition | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `operator-attested` | definition | `asset:proof-mode` | Proof mode [definition] |
| `operator-attested` | definition | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `operator-work-label-hid-its-own-preconditions` | friction | `asset:codex-reinstall-the-boundary-so-adr0375-is-in-force` | Re-install the boundary so the landed fix is actually in force [increment] |
| `oq-acceptance-has-four-doors-where-should-a-decision-s-code` | open-question | `asset:adr-0438` | Anchor fingerprints are frozen by an explicit act, not by the acceptance transition [adr] |
| `oq-decision-offer-width` | open-question | `asset:adr-0464` | Retire the citation-derived offer surface: search and depends_on become the discovery route [adr] |
| `oq-how-does-a-ci-cross-repo-observed-effect-reach-our-build` | open-question | `asset:adr-0466` | An outside-observed check reaches our proof by publishing its result back, trusted [adr] |
| `oq-how-does-the-map-report-a-capability-s-state-once-the-gro` | open-question | `asset:adr-0461` | A capability's state is a named terrain, not a colour [adr] |
| `oq-is-a-twice-patched-community-plugin-an-acceptable-foundat` | open-question | `asset:adr-0458` | Build the diff-scoped mutation rung on the patched plugin, and report the defects upstream in parallel [adr] |
| `oq-may-the-shipped-map-s-land-carry-a-worn-path-and-what-doe` | open-question | `asset:adr-0463` | The shipped map's markings — the worn path is dependency, rocks are foundations, a stale criterion returns to bud [adr] |
| `oq-most-of-d6-s-67-capabilities-are-already-built-so-there-i` | open-question | `asset:adr-0465` | Long-running unproven capabilities are adopted on the owner's risk acceptance, not proven [adr] |
| `oq-retire-the-amends-edge` | open-question | `asset:adr-0431` | Retire the amends edge: one support edge, prose-carried amendment, and search as the discovery route [adr] |
| `oq-the-by-hand-half-of-test-hardening-was-measured-as-paying` | open-question | `asset:adr-0460` | The automated diff-scoped mutation rung discharges the perpetual manual-sweep half of ADR-0450 [adr] |
| `oq-the-codex-quota-is-exhausted-until-sep-23-which-subscript` | open-question | `asset:adr-0435` | Model-driven UAT walks run on the Claude subscription by default — Codex becomes the explicit selection [adr] |
| `oq-the-composition-trial-needs-six-more-weeks-it-may-not-hav` | open-question | `asset:adr-0444` | The decision-read baseline becomes a standing regression KPI in factory health; the composition trial stands down [adr] |
| `oq-the-island-is-re-dressed-and-thirty-five-of-them-stand-to` | open-question | `asset:adr-0475` | A capability's state is the object standing on it; the land carries the island's own state [adr] |
| `oq-what-greens-a-story-that-cannot-be-proven` | open-question | `asset:adr-0443` | Only undertaken capabilities gate a story's green; a story with no signable UAT greens on what it can prove [adr] |
| `oq-what-makes-the-context-meter-useful` | open-question | `asset:adr-0452` | The context meter ships as an orchestrator-window widget; a helper view may be proposed but carries no owner stamp [adr] |
| `oq-which-endpoint-does-the-pi-worker-point-at-for-its-one-re` | open-question | `asset:adr-0449` | pi's one real trial run is admitted through the Claude subscription token, not a metered endpoint or a local model [adr] |
| `oq-which-third-principle-does-the-website-pitch-rest-on` | open-question | `asset:adr-0442` | Three principles govern what a storytree surface shows [adr] |
| `orchestrate-route-supplement` | pattern | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `orchestrate-route-supplement` | pattern | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `orchestrate-route-supplement` | pattern | `doc:decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md` | Dogfood the inner loop as the default; node-borne proof config is the keystone expansion [adr, now `adr-0057`] |
| `orchestrate-route-supplement` | pattern | `asset:prove-it-gate` | Prove-it gate [principle] |
| `orchestrate-route-supplement` | pattern | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `orchestrate-route-supplement` | pattern | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `orchestrate-route-supplement` | pattern | `asset:cross-story-dependency` | Cross-story dependency direction and the no-cycle rule [principle] |
| `orchestrate-route-supplement` | pattern | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `orchestrate-route-supplement` | pattern | `asset:glue` | glue [definition] |
| `orchestrate-route-supplement` | pattern | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `orchestrate-route-supplement` | pattern | `asset:mechanical-red-redrive-brief` | Scope the edits-existing re-drive brief: one behaviour, mechanical red, frozen build [pattern] |
| `orchestrate-route-supplement` | pattern | `asset:pin-the-dual-runtime-import-form` | The published surface is not evidence of runtime shape -- probe, then pin [pattern] |
| `orchestrator` | definition | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `orchestrator` | definition | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `orchestrator` | definition | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `orchestrator` | definition | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `orchestrator` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `orchestrator` | definition | `asset:spine` | spine [definition] |
| `orchestrator` | definition | `asset:pi-adapter` | agent package [definition] |
| `orchestrator-is-sole-fan-out` | guardrail | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `orchestrator-is-sole-fan-out` | guardrail | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `orientation-reads-primary-checkout-writes-worktree-corpus` | friction | `doc:decisions/0266-the-software-factory-is-a-master-process-a-branch-edged-stat.md` | The software factory is a master process: a branch-edged station index, Library-canonical, with a navigable flow render [adr, now `adr-0266`] |
| `orientation-reads-primary-checkout-writes-worktree-corpus` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `owner-fork-bar` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `owner-fork-bar` | principle | `asset:survival-test-for-adrs` | The survival test for ADRs [principle] |
| `owner-fork-bar` | principle | `asset:stateless-vs-stateful-graduation` | Stateless graduates, stateful stays [principle] |
| `owner-fork-bar` | principle | `asset:assess-tradeoffs-by-naming-both-sides` | Assess tradeoffs by naming both sides [pattern] |
| `owner-fork-bar` | principle | `doc:decisions/0018-knowledge-tier-phase1-structured-source.md` | Knowledge tier Phase 1 — structured source of truth, generated views, corpus curation [adr, now `adr-0018`] |
| `owner-fork-bar` | principle | `doc:decisions/0032-cite-graduation-mechanism.md` | The cite + graduation mechanism — a cite is a typed link; graduation is a future synthesis agent [adr, now `adr-0032`] |
| `owner-fork-bar` | principle | `doc:decisions/0084-agents-may-flip-an-adr-green.md` | Agents may flip an ADR green [adr, now `adr-0084`] |
| `ownership-totality-decays-faster-than-an-increment-repairs-it` | friction | `asset:capability-layer-coverage-arc` | The capability layer covers what sessions write, or says why not [arc] |
| `ownership-totality-decays-faster-than-an-increment-repairs-it` | friction | `asset:capability-layer-coverage-arc-inc-05` | Increment 5 — the `cli` story, and the last untried run of the rule-(5) falsifier. [increment] |
| `ownership-totality-is-ci-only-so-a-new-file-costs-a-ci-round-trip` | friction | `node:work-verdict-event-log` | _(a work-tree node — story or capability)_ |
| `ownership-totality-is-only-discoverable-behind-the-full-gate` | friction | `doc:decisions/0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr, now `adr-0317`] |
| `own-the-layers` | principle | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `own-the-layers` | principle | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `package-scripts-dirs-are-outside-typecheck-include` | friction | `doc:decisions/0342-decomposing-the-cli-dispatcher-cannot-buy-its-measured-width.md` | Decomposing the CLI dispatcher cannot buy its measured width, and the registry path is exhausted [adr, now `adr-0342`] |
| `pair-the-fence-with-the-affordance` | pattern | `asset:guidance-quality` | Guidance quality [principle] |
| `pair-the-fence-with-the-affordance` | pattern | `asset:signal-and-noise` | Signal and noise [principle] |
| `parallel-build-lane-fan-out` | pattern | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `parallel-build-lane-fan-out` | pattern | `asset:art-asset-designer-swarm` | Art-asset designer-swarm: one design subagent per visual asset [pattern] |
| `parallel-build-lane-fan-out` | pattern | `asset:claim` | claim [definition] |
| `parallel-build-lane-fan-out` | pattern | `asset:claim-the-owning-story` | Claim by write-ownership — at capability grain [principle] |
| `parallel-build-lane-fan-out` | pattern | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `parallel-build-lane-fan-out` | pattern | `asset:a-fan-out-result-does-not-report-its-own-completeness` | A fan-out result does not report its own completeness [principle] |
| `parallel-build-lane-fan-out` | pattern | `asset:orchestrator-is-sole-fan-out` | The orchestrator is the sole fan-out point [guardrail] |
| `parallel-build-lane-fan-out` | pattern | `doc:decisions/0344-live-fan-out-clears-the-bar-on-both-axes-and-the-binding-con.md` | Live fan-out clears the bar on both axes, and the binding constraint is still width [adr, now `adr-0344`] |
| `parallel-build-lane-fan-out` | pattern | `doc:decisions/0332-fan-out-vehicle-is-chosen-by-measured-onboarding-price-and-t.md` | Fan-out vehicle is chosen by measured onboarding price, and the binding constraint is width [adr, now `adr-0332`] |
| `parallel-build-lane-fan-out` | pattern | `doc:decisions/0331-a-fan-out-primitive-for-read-only-sweeps-is-not-built-the-fa.md` | A fan-out primitive for read-only sweeps is not built; the factory already overlaps its delegates [adr, now `adr-0331`] |
| `parked-increment-mis-sized-by-an-unchecked-import-boundary` | friction | `doc:decisions/0375-the-resident-claim-authority-lives-in-the-desktop-app-and-th.md` | The resident claim authority lives in the desktop app, and the managed hook reads through it [adr, now `adr-0375`] |
| `parked-increment-mis-sized-by-an-unchecked-import-boundary` | friction | `doc:decisions/0112-extract-the-build-orchestrate-drivers-into-packages-drive.md` | Extract the build/orchestrate drivers into packages/drive [adr, now `adr-0112`] |
| `partial-vi-mock-hides-a-newly-required-context-field` | friction | `doc:decisions/0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md` | Studio map responsiveness — cache and defer before cutting density [adr, now `adr-0240`] |
| `per-call-waitfor-timeout-overrides-the-load-ceiling` | friction | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `per-call-waitfor-timeout-overrides-the-load-ceiling` | friction | `asset:test-creation-principles` | Test creation principles [principle] |
| `per-call-waitfor-timeout-overrides-the-load-ceiling` | friction | `doc:decisions/0276-wall-clock-timing-leaves-the-gate-tier.md` | Wall-clock timing leaves the gate tier [adr, now `adr-0276`] |
| `per-call-waitfor-timeout-overrides-the-load-ceiling` | friction | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `per-call-waitfor-timeout-overrides-the-load-ceiling` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `per-node-budget` | definition | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `per-node-budget` | definition | `doc:decisions/0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr, now `adr-0130`] |
| `per-node-budget` | definition | `doc:decisions/0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md` | Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130) [adr, now `adr-0131`] |
| `per-node-budget` | definition | `asset:spine-sequences-leaf-judges` | The spine sequences, the leaf judges [principle] |
| `per-node-budget` | definition | `asset:event` | event [definition] |
| `per-node-budget` | definition | `asset:meter-fail-closed-caps-in-real-cost` | Meter a fail-closed cap in real cost [principle] |
| `pi-adapter` | definition | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `pi-adapter` | definition | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `pi-adapter` | definition | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `pi-adapter` | definition | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `pi-adapter` | definition | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `pi-adapter` | definition | `doc:decisions/0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md` | Add a ChatGPT-subscription Codex prove-it leaf [adr, now `adr-0232`] |
| `pi-adapter` | definition | `asset:orchestrator` | orchestrator [definition] |
| `pi-adapter` | definition | `asset:thin-wrapper-over-the-runtime` | Thin wrapper over the runtime [pattern] |
| `pi-event-stream` | definition | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `pi-event-stream` | definition | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `pi-event-stream` | definition | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `pi-event-stream` | definition | `asset:event` | event [definition] |
| `pi-event-stream` | definition | `asset:event-log` | event log [definition] |
| `pi-event-stream` | definition | `asset:pi-adapter` | agent package [definition] |
| `pin-the-dual-runtime-import-form` | pattern | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `pin-the-dual-runtime-import-form` | pattern | `asset:a-live-only-guarantee-is-an-honesty-gap` | A live-only-provable guarantee is an honesty gap [principle] |
| `pin-the-dual-runtime-import-form` | pattern | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `pin-the-dual-runtime-import-form` | pattern | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `pin-the-dual-runtime-import-form` | pattern | `asset:launch-desktop` | Launch the desktop client [process] |
| `plain-language-first` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `plain-language-first` | principle | `asset:guidance-quality` | Guidance quality [principle] |
| `plan` | definition | `doc:decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `plan` | definition | `asset:arc` | Arc [definition] |
| `plan` | definition | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `plan` | definition | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `plan-model-judged-uat` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `plan-model-judged-uat` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `plan-model-judged-uat` | increment | `asset:model-uat-promotion` | Model-judged UAT promotion [arc] |
| `plan-model-judged-uat` | increment | `doc:docs/decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-judged-uat` | increment | `doc:docs/decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-model-judged-uat` | increment | `doc:docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `plan-model-judged-uat` | increment | `doc:docs/decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `plan-model-uat-witness` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-uat-witness-v2` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-uat-witness-v3` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-uat-witness-v4` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-model-uat-witness-v4` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-uat-witness-v5` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-model-uat-witness-v5` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-model-uat-witness-v6` | increment | `doc:decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-model-uat-witness-v6` | increment | `doc:decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-uat-criterion-detail` | increment | `doc:docs/decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-uat-criterion-detail` | increment | `doc:docs/decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-uat-criterion-detail` | increment | `doc:docs/decisions/0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md` | The Library agent tier is seed-canonical; sync-agents reconciles it to the live store [adr, now `adr-0055`] |
| `plan-uat-criterion-detail` | increment | `doc:docs/decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `plan-uat-criterion-detail` | increment | `asset:model-uat-promotion` | Model-judged UAT promotion [arc] |
| `plan-uat-criterion-detail` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `plan-uat-criterion-detail` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `plan-uat-detail-studio` | increment | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `plan-uat-detail-studio` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `plan-uat-detail-studio` | increment | `doc:docs/decisions/0209-tier-model-judged-uat-below-irreducible-human-witness.md` | Tier model-judged UAT below irreducible human witness [adr, now `adr-0209`] |
| `plan-uat-detail-studio` | increment | `doc:docs/decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md` | Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration [adr, now `adr-0192`] |
| `plan-uat-detail-studio` | increment | `doc:docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md` | Per-test UAT tests earn green by declared witness; story UAT greens when all pass [adr, now `adr-0082`] |
| `plan-uat-detail-studio` | increment | `doc:docs/decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `plan-uat-detail-studio` | increment | `doc:docs/decisions/0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md` | Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier [adr, now `adr-0183`] |
| `plan-uat-detail-studio` | increment | `asset:model-uat-promotion` | Model-judged UAT promotion [arc] |
| `pnpm-gate-exceeds-the-foreground-tool-ceiling` | friction | `node:ci-cd` | _(a work-tree node — story or capability)_ |
| `pnpm-gate-exceeds-the-foreground-tool-ceiling` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `pnpm-gate-help-silently-runs-a-full-gate` | friction | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `powershell-native-stderr-aborts-exact-actuator` | friction | `doc:decisions/0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md` | Interactive Codex writes only in its current claimed worktree [adr, now `adr-0355`] |
| `preview-start-runs-from-launch-dir-not-worktree` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `preview-start-runs-from-launch-dir-not-worktree` | friction | `asset:codex-onboarding-journey-arc` | Codex onboarding journey [arc] |
| `price-the-deferral` | principle | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `price-the-deferral` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `price-the-deferral` | principle | `asset:verification-decay-detection` | Verification-decay detection [process] |
| `price-the-deferral` | principle | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `principle-shape-drift-seed-vs-schema` | friction | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `principle-shape-drift-seed-vs-schema` | friction | `asset:guidance-curator` | guidance-curator [agent] |
| `probe-dont-assume-db-reachability` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `probe-dont-assume-db-reachability` | principle | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `probe-dont-assume-db-reachability` | principle | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `probe-dont-assume-db-reachability` | principle | `doc:decisions/0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md` | db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess) [adr, now `adr-0063`] |
| `probe-dont-assume-db-reachability` | principle | `doc:decisions/0021-keyless-agent-session-auth-and-db-bootstrap.md` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr, now `adr-0021`] |
| `probe-selects-by-the-same-expression-as-its-subject` | friction | `doc:research/tell-pace-2026-08-29/README.md` | _(a repo path, not a library row)_ |
| `process-entrypoint-check-reads-one-field-so-a-deleted-command-lives-on-in-steps` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `process-entrypoint-check-reads-one-field-so-a-deleted-command-lives-on-in-steps` | friction | `asset:retire-realized-proposal` | Retire a realized proposal [process] |
| `process-entrypoint-check-reads-one-field-so-a-deleted-command-lives-on-in-steps` | friction | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `process-entrypoint-check-reads-one-field-so-a-deleted-command-lives-on-in-steps` | friction | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `promote-fixture-teardown-enotempty-reds-unrelated-prs` | friction | `doc:decisions/0195-affected-only-pr-test-scope-ci-cost-scales-with-the-change-n.md` | Affected-only PR test scope: CI cost scales with the change, not the repo [adr, now `adr-0195`] |
| `proof-hash` | definition | `asset:verdict` | verdict [definition] |
| `proof-hash` | definition | `asset:evidence` | evidence [definition] |
| `proof-mode` | definition | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `proof-mode` | definition | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `proof-mode` | definition | `asset:story` | story [definition] |
| `proof-mode` | definition | `asset:capability` | capability [definition] |
| `proof-mode` | definition | `asset:contract` | contract [definition] |
| `proof-mode` | definition | `asset:operator-attested` | operator-attested [definition] |
| `proof-walkthrough-first` | pattern | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `proof-walkthrough-first` | pattern | `asset:splitting-rule` | The splitting rule [principle] |
| `proof-walkthrough-first` | pattern | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `prose-names-a-set-it-never-checked` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `prose-names-a-set-it-never-checked` | principle | `asset:doc-vs-implementation-precedence` | Doc-vs-implementation precedence [principle] |
| `prose-names-a-set-it-never-checked` | principle | `asset:price-the-deferral` | Price the deferral [principle] |
| `prose-names-a-set-it-never-checked` | principle | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `prose-names-a-set-it-never-checked` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `prose-names-a-set-it-never-checked` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `prose-names-a-set-it-never-checked` | principle | `doc:decisions/0246-forests-for-other-projects-the-adr-0133-deferral-is-lifted-a.md` | Forests for other projects: the ADR-0133 deferral is lifted and scoped as its own arc [adr, now `adr-0246`] |
| `protocol-foundations-proof-arc-inc-01` | increment | `story:proof-protocol` | _(a typed work-hierarchy pointer)_ |
| `protocol-foundations-proof-arc-inc-01` | increment | `story:storage-protocol` | _(a typed work-hierarchy pointer)_ |
| `prove-and-promote-ceremony` | process | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `prove-and-promote-ceremony` | process | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `prove-and-promote-ceremony` | process | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `prove-and-promote-ceremony` | process | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `prove-and-promote-ceremony` | process | `doc:decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md` | Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant [adr, now `adr-0117`] |
| `prove-and-promote-ceremony` | process | `doc:decisions/0122-per-contract-coverage-check-map-each-declared-contract-to-an.md` | Per-contract coverage check: map each declared contract to an observed test [adr, now `adr-0122`] |
| `prove-and-promote-ceremony` | process | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `prove-and-promote-ceremony` | process | `asset:merge-ceremony` | Merge ceremony [process] |
| `prove-and-promote-ceremony` | process | `asset:prove-it-gate` | Prove-it gate [principle] |
| `prove-and-promote-ceremony` | process | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `prove-and-promote-ceremony` | process | `asset:story-tree` | story tree [definition] |
| `prove-it-gate` | principle | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `prove-it-gate` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `prove-it-gate` | principle | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `prove-it-gate` | principle | `asset:gate` | gate [definition] |
| `pull-based-context-architecture` | pattern | `asset:recursive-decomposition-patterns` | Recursive decomposition patterns [pattern] |
| `pull-based-context-architecture` | pattern | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `pull-based-context-architecture` | pattern | `asset:signal-and-noise` | Signal and noise [principle] |
| `pull-based-context-architecture` | pattern | `doc:decisions/0053-cli-builds-its-guidance-prose-from-the-library.md` | CLI builds its guidance prose from the library [adr, now `adr-0053`] |
| `raw-field-read-under-pnpm-is-confounded-by-the-wrapper-banner` | friction | `doc:decisions/0361-the-guidance-write-path-proves-its-own-fidelity-a-trusted-ch.md` | The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write [adr, now `adr-0361`] |
| `readme-hand-transcribes-numbers-a-driver-already-computed` | friction | `asset:adr-0415` | Detail is bounded by performance and accessibility, and bought textured 3D assets are an accepted chapter-2 art source [adr] |
| `real-author-test-exhaustion-on-focused-camera-unit` | friction | `node:act2-regrow-camera-frame-delivery` | _(a work-tree node — story or capability)_ |
| `real-build-custom-vitest-cannot-confirm-red-2026-08-06` | friction | `node:act2-regrow-camera-zoom-out` | _(a work-tree node — story or capability)_ |
| `real-build-killed-loses-its-promotion` | friction | `node:compositor-pan-transform` | _(a work-tree node — story or capability)_ |
| `real-build-killed-loses-its-promotion` | friction | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `real-build-resolve-does-not-preflight-coverage-drain` | friction | `node:arc-explicit-id-fidelity` | _(a work-tree node — story or capability)_ |
| `real-build-signs-a-pass-over-code-its-own-typecheck-rejects` | friction | `doc:decisions/0235-record-context-traversal-at-deterministic-runtime-boundaries.md` | Record context traversal at deterministic runtime boundaries [adr, now `adr-0235`] |
| `real-proofcommand-narrower-than-write-scope` | friction | `node:compositor-pan-transform` | _(a work-tree node — story or capability)_ |
| `real-proofcommand-narrower-than-write-scope` | friction | `node:coalesced-camera-pan` | _(a work-tree node — story or capability)_ |
| `real-test-must-not-leak-a-handle` | principle | `doc:decisions/0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md` | A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate [adr, now `adr-0098`] |
| `real-test-must-not-leak-a-handle` | principle | `doc:decisions/0054-live-gated-tests-isolate-to-a-disposable-database-fail-close.md` | Live-gated tests isolate to a disposable database, fail-closed against production [adr, now `adr-0054`] |
| `real-test-must-not-leak-a-handle` | principle | `asset:dogfood-fix-the-source` | Dogfood: fix the source [principle] |
| `real-test-must-not-leak-a-handle` | principle | `asset:baseline-preservation` | Baseline preservation [principle] |
| `reclassify-greenfield-brown-units-v2` | increment | `asset:reclassify-greenfield-brown-units` | Reclassify greenfield brown units [increment] |
| `reclassify-greenfield-brown-units-v2` | increment | `asset:lifecycle-status` | lifecycle status [definition] |
| `reclassify-greenfield-brown-units-v2` | increment | `doc:decisions/0395-brown-records-provenance-missing-proof-stays-on-the-greenfie.md` | Brown records provenance; proof absence does not invent it [adr, now `adr-0395`] |
| `recomputing-a-uat-criterion-revision-has-no-verb` | friction | `asset:edit-story-uat-criteria` | Edit a story's UAT criteria [process] |
| `recomputing-a-uat-criterion-revision-has-no-verb` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `recomputing-a-uat-criterion-revision-has-no-verb` | friction | `doc:decisions/0253-criterion-identity-is-immutable-across-uat-revisions.md` | Criterion identity is immutable across UAT revisions [adr, now `adr-0253`] |
| `recursive-decomposition-patterns` | pattern | `asset:exploration-principles` | Exploration principles [principle] |
| `recursive-decomposition-patterns` | pattern | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `red-builder` | agent | `asset:prove-it-gate` | Prove-it gate [principle] |
| `red-builder` | agent | `asset:red-green` | red-green [principle] |
| `red-builder` | agent | `asset:spine-sequences-leaf-judges` | The spine sequences, the leaf judges [principle] |
| `red-builder` | agent | `asset:test-creation-principles` | Test creation principles [principle] |
| `red-builder` | agent | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `red-builder` | agent | `asset:real-test-must-not-leak-a-handle` | A driven test must not leak an OS handle [principle] |
| `red-builder` | agent | `asset:baseline-preservation` | Baseline preservation [principle] |
| `red-builder` | agent | `asset:dogfood-fix-the-source` | Dogfood: fix the source [principle] |
| `red-builder` | agent | `asset:right-kind-red` | The red must be the right kind [guardrail] |
| `red-builder` | agent | `asset:reward-hacking` | Reward hacking [principle] |
| `red-builder` | agent | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `red-builder` | agent | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `red-builder` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `red-builder` | agent | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `red-builder` | agent | `asset:a-mocked-seam-leaves-its-default-implementation-unproven` | A mocked seam leaves its default implementation unproven [principle] |
| `red-builder` | agent | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `red-builder` | agent | `asset:a-live-only-guarantee-is-an-honesty-gap` | A live-only-provable guarantee is an honesty gap [principle] |
| `red-builder` | agent | `asset:an-inherited-precondition-holds-only-where-and-when-it-was-authored` | An inherited precondition holds only where and when it was authored [principle] |
| `red-green` | principle | `asset:contract` | contract [definition] |
| `reference-dont-restate` | principle | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `reference-dont-restate` | principle | `doc:decisions/0017-cross-cutting-knowledge-tier.md` | The cross-cutting knowledge tier (resolves open-q §9) [adr, now `adr-0017`] |
| `reference-dont-restate` | principle | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `reference-dont-restate` | principle | `doc:decisions/0029-agents-as-library-artifact-category.md` | The agent roster is a Library artifact category (`agent` kind) [adr, now `adr-0029`] |
| `reference-dont-restate` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `reference-dont-restate` | principle | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `reference-dont-restate` | principle | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `reference-dont-restate` | principle | `doc:decisions/0053-cli-builds-its-guidance-prose-from-the-library.md` | CLI builds its guidance prose from the library [adr, now `adr-0053`] |
| `reference-dont-restate` | principle | `asset:citing-a-document-is-not-reading-it` | Citing a document is not reading it [principle] |
| `register-follows-audience` | principle | `asset:plain-language-first` | Plain language first [principle] |
| `register-follows-audience` | principle | `asset:guidance-quality` | Guidance quality [principle] |
| `register-follows-audience` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `renamed-test-file-leaves-a-binding-no-instrument-flags` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `renamed-test-file-leaves-a-binding-no-instrument-flags` | friction | `doc:decisions/0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md` | Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted [adr, now `adr-0294`] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `asset:deterministic-parameterised-geometry` | Deterministic, parameterised geometry [principle] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `render-and-witness-a-flag-guarded-surface` | pattern | `asset:prove-it-gate` | Prove-it gate [principle] |
| `repo-surface-allowlist` | guardrail | `doc:decisions/0025-repo-surface-allowlist-gate.md` | Repo-surface allow-list gate — root + docs/ require a justified manifest entry [adr, now `adr-0025`] |
| `repo-surface-allowlist` | guardrail | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `repo-surface-allowlist` | guardrail | `doc:decisions/0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md` | Gate survival is evidence-backed: retain nine production-catching rungs and retire sixteen [adr, now `adr-0311`] |
| `repo-surface-allowlist` | guardrail | `doc:decisions/0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr, now `adr-0317`] |
| `repo-surface-allowlist` | guardrail | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `repo-surface-allowlist` | guardrail | `asset:signal-and-noise` | Signal and noise [principle] |
| `repo-surface-allowlist` | guardrail | `asset:gate` | gate [definition] |
| `repo-surface-allowlist` | guardrail | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `repo-surface-allowlist` | guardrail | `asset:prove-it-gate` | Prove-it gate [principle] |
| `retire-realized-proposal` | process | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `retire-realized-proposal` | process | `doc:decisions/0196-unified-artifact-lifecycle-open-active-archived.md` | Unified artifact lifecycle: open, active, archived [adr, now `adr-0196`] |
| `retire-realized-proposal` | process | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `retire-realized-proposal` | process | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `retire-realized-proposal` | process | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `retire-realized-proposal` | process | `doc:decisions/0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md` | Online or nothing: the live store is the only source of truth and offline support is dropped [adr, now `adr-0302`] |
| `retire-reason-at-path-is-stored-literally` | friction | `asset:retire-realized-proposal` | Retire a realized proposal [process] |
| `retiring-an-answered-question-orphans-the-prose-that-raised-it` | friction | `node:library-review` | _(a work-tree node — story or capability)_ |
| `retiring-an-answered-question-orphans-the-prose-that-raised-it` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `retiring-a-realized-proposal-has-no-verb` | friction | `asset:retire-realized-proposal` | Retire a realized proposal [process] |
| `retiring-a-realized-proposal-has-no-verb` | friction | `doc:decisions/0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md` | The tool route emits a proposal, and the proposal tier carries the delivery signal [adr, now `adr-0287`] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `asset:an-inherited-precondition-holds-only-where-and-when-it-was-authored` | An inherited precondition holds only where and when it was authored [principle] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `asset:trace-the-defect-to-its-producing-stage-before-building` | Trace a defect to its producing stage before building against it [principle] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `asset:verification-decay-detection` | Verification-decay detection [process] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `doc:decisions/0293-the-chapter-2-growth-track-grows-the-wood-first-and-flushes.md` | The Chapter 2 growth track grows the wood first and flushes the leaves after [adr, now `adr-0293`] |
| `revalidate-instruments-when-a-decision-widens-a-domain` | principle | `doc:decisions/0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr, now `adr-0269`] |
| `reward-hacking` | principle | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `reward-hacking` | principle | `asset:test-creation-principles` | Test creation principles [principle] |
| `reward-hacking` | principle | `asset:faked-uat-theatre` | Faked-UAT theatre [pattern] |
| `reward-hacking` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `reward-hacking` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `right-kind-red` | guardrail | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `right-kind-red` | guardrail | `asset:red-green` | red-green [principle] |
| `route-structural-forks-to-story-author` | principle | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `route-structural-forks-to-story-author` | principle | `asset:story-author` | story-author [agent] |
| `route-structural-forks-to-story-author` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `route-structural-forks-to-story-author` | principle | `doc:decisions/0112-extract-the-build-orchestrate-drivers-into-packages-drive.md` | Extract the build/orchestrate drivers into packages/drive [adr, now `adr-0112`] |
| `route-structural-forks-to-story-author` | principle | `doc:decisions/0110-collapse-the-redundant-end-of-flow-adr-ratification.md` | Collapse the redundant end-of-flow ADR ratification — record the owner's design-time decision once [adr, now `adr-0110`] |
| `route-structural-forks-to-story-author` | principle | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `run` | definition | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `run` | definition | `asset:node` | node [definition] |
| `run` | definition | `asset:event` | event [definition] |
| `run-is-not-a-node` | guardrail | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `same-builder-fixtures-cannot-detect-a-normalisation-disagreement` | friction | `node:drive-machinery` | _(a work-tree node — story or capability)_ |
| `same-builder-fixtures-cannot-detect-a-normalisation-disagreement` | friction | `doc:decisions/0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md` | The write-authority wall is agent-inescapable and binds shared checkouts [adr, now `adr-0257`] |
| `scratchpad-scripts-cannot-import-workspace-packages` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:unrun-check-is-unverified-not-refuted` | A check that could not run is unverified, not refuted [principle] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:probe-dont-assume-db-reachability` | Probe DB reachability, never infer it [principle] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:db-control` | DB control [process] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:one-way-to-do-things` | One way to do things [principle] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `separate-the-verdict-from-the-scaffolding` | principle | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `session-claim-silently-cleared-mid-session-fails-the-gate-late` | friction | `node:session-claim-ledger` | _(a work-tree node — story or capability)_ |
| `session-cutting` | definition | `doc:decisions/0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md` | Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write [adr, now `adr-0137`] |
| `session-cutting` | definition | `asset:in-session-subagent` | in-session subagent [definition] |
| `session-cutting` | definition | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `session-cutting` | definition | `asset:arc` | Arc [definition] |
| `session-cutting` | definition | `doc:decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr, now `adr-0271`] |
| `session-cutting` | definition | `doc:decisions/0275-sessions-may-continue-past-merge-the-unit-ends-ending-the-se.md` | Sessions may continue past merge: the unit ends; ending the session is an orchestration call [adr, now `adr-0275`] |
| `session-cutting` | definition | `asset:merge-ceremony` | Merge ceremony [process] |
| `session-orchestrator` | agent | `asset:merge-ceremony` | Merge ceremony [process] |
| `session-orchestrator` | agent | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `session-orchestrator` | agent | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `session-orchestrator` | agent | `asset:attempt-privileged-actions-approve-inline` | Attempt privileged actions, approve inline [process] |
| `session-orchestrator` | agent | `asset:stage-the-attestation-experience` | Stage the attestation experience [process] |
| `session-orchestrator` | agent | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `session-orchestrator` | agent | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `session-orchestrator` | agent | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `session-orchestrator` | agent | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `session-orchestrator` | agent | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `session-orchestrator` | agent | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `session-orchestrator` | agent | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `session-orchestrator` | agent | `asset:delegate-exploration-to-digest-subagents` | Delegate exploration to digest-returning subagents [principle] |
| `session-orchestrator` | agent | `asset:observability-first` | Observability-first [principle] |
| `session-orchestrator` | agent | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `session-orchestrator` | agent | `asset:audit-the-signed-verdict` | Audit the signed verdict against the spec [principle] |
| `session-orchestrator` | agent | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `session-orchestrator` | agent | `asset:plain-language-first` | Plain language first [principle] |
| `session-orchestrator` | agent | `asset:meter-fail-closed-caps-in-real-cost` | Meter a fail-closed cap in real cost [principle] |
| `session-orchestrator` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `session-orchestrator` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `session-orchestrator` | agent | `asset:approval-gated-trunk` | Approval-gated trunk [guardrail] |
| `session-orchestrator` | agent | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `session-orchestrator` | agent | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `session-orchestrator` | agent | `asset:friction-justification-bar` | Friction earns durable guidance by supporting evidence, not by being reported [principle] |
| `session-orchestrator` | agent | `asset:arc` | Arc [definition] |
| `session-orchestrator` | agent | `asset:plan` | Plan [definition] |
| `session-orchestrator` | agent | `asset:session-cutting` | session cutting [definition] |
| `set-field-from-file-is-a-replace-reached-for-as-an-append` | friction | `asset:pull-the-four-land-colours-apart-in-hue` | Pull the four land status colours apart in hue [increment] |
| `set-field-from-file-is-a-replace-reached-for-as-an-append` | friction | `asset:adr-0361` | The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write [adr] |
| `settle-probe-pinned-the-animation-it-measured` | friction | `doc:research/chapter2-code-only-art-2026-08-01/blender-hero-v1/README.md` | _(a repo path, not a library row)_ |
| `shared-store-schema-migration` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `shared-store-schema-migration` | process | `doc:decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md` | The noticeboard is the claim ledger — forced session claims, presence retired [adr, now `adr-0200`] |
| `shared-store-schema-migration` | process | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `shared-store-schema-migration` | process | `doc:decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md` | Sessions end at merge: land, debrief, go inert; work re-enters through fresh sessions [adr, now `adr-0271`] |
| `shared-store-schema-migration` | process | `asset:db-control` | DB control [process] |
| `shared-store-schema-migration` | process | `asset:merge-ceremony` | Merge ceremony [process] |
| `shared-store-schema-migration` | process | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `shared-store-schema-migration` | process | `asset:tightening-a-shared-contract-needs-a-full-sweep` | Tightening a shared contract needs a full sweep [principle] |
| `shared-tmp-path-interleaves-concurrent-sessions-gate-logs` | friction | `asset:the-same-file-in-another-tree-is-a-different-file` | The same file in another tree is a different file [principle] |
| `shared-tmp-path-interleaves-concurrent-sessions-gate-logs` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `signal-and-noise` | principle | `asset:guidance-quality` | Guidance quality [principle] |
| `signals-must-be-real` | principle | `asset:observability-first` | Observability-first [principle] |
| `signals-must-be-real` | principle | `asset:prove-it-gate` | Prove-it gate [principle] |
| `signals-must-be-real` | principle | `asset:show-what-matters-at-this-stage` | Show what matters at the stage they are at [principle] |
| `slow-growth-minimum-to-green` | principle | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `slow-growth-minimum-to-green` | principle | `asset:red-green` | red-green [principle] |
| `slow-growth-minimum-to-green` | principle | `asset:deep-modules` | Deep modules [principle] |
| `software-factory` | definition | `asset:software-factory-line` | The software factory line [process] |
| `software-factory` | definition | `asset:merge-ceremony` | Merge ceremony [process] |
| `software-factory` | definition | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `software-factory` | definition | `doc:decisions/0266-the-software-factory-is-a-master-process-a-branch-edged-stat.md` | The software factory is a master process: a branch-edged station index, Library-canonical, with a navigable flow render [adr, now `adr-0266`] |
| `software-factory-line` | process | `asset:software-factory` | software factory [definition] |
| `software-factory-line` | process | `asset:prove-it-gate` | Prove-it gate [principle] |
| `software-factory-line` | process | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `software-factory-line` | process | `doc:decisions/0266-the-software-factory-is-a-master-process-a-branch-edged-stat.md` | The software factory is a master process: a branch-edged station index, Library-canonical, with a navigable flow render [adr, now `adr-0266`] |
| `software-factory-line` | process | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `software-factory-line` | process | `doc:decisions/0022-ci-green-gate-and-auto-merge.md` | CI green gate + auto-merge-on-green (inside free Actions) [adr, now `adr-0022`] |
| `software-factory-line` | process | `doc:decisions/0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr, now `adr-0161`] |
| `spec-code-citations-rot-unchecked` | friction | `node:prove-spec-resolution` | _(a work-tree node — story or capability)_ |
| `spec-negative-existence-claim-becomes-an-authoring-brief` | friction | `node:organism-boundary-tooling` | _(a work-tree node — story or capability)_ |
| `spec-negative-existence-claim-becomes-an-authoring-brief` | friction | `node:arc-explicit-id-fidelity` | _(a work-tree node — story or capability)_ |
| `spine` | definition | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `spine` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `spine` | definition | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `spine` | definition | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `spine` | definition | `asset:leaf-step-leaf-judgment` | leaf step / leaf judgment [definition] |
| `spine` | definition | `asset:orchestrator` | orchestrator [definition] |
| `spine` | definition | `asset:prove-it-gate` | Prove-it gate [principle] |
| `spine-sequences-leaf-judges` | principle | `doc:decisions/0005-orchestration-spine-code-vs-judgment.md` | Orchestration spine — code sequences, pi judges [adr, now `adr-0005`] |
| `splitting-rule` | principle | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `splitting-rule` | principle | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `splitting-rule` | principle | `asset:journey-principle` | The journey principle [principle] |
| `splitting-rule` | principle | `asset:deep-modules` | Deep modules [principle] |
| `stack-claude-agent-sdk` | techstack | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `stack-claude-agent-sdk` | techstack | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `stack-claude-agent-sdk` | techstack | `doc:decisions/0020-red-green-enforcement-on-the-owned-loop.md` | Red-green is enforced spine-side on the owned loop (not by process isolation) [adr, now `adr-0020`] |
| `stack-claude-agent-sdk` | techstack | `doc:decisions/0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md` | Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness [adr, now `adr-0198`] |
| `stack-claude-agent-sdk` | techstack | `doc:decisions/0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md` | Add a ChatGPT-subscription Codex prove-it leaf [adr, now `adr-0232`] |
| `stack-claude-agent-sdk` | techstack | `asset:stack-pi-coding-agent` | The owned agent loop · offline & pivot-out fallback [techstack] |
| `stack-cloud-sql-keyless-iam` | techstack | `doc:decisions/0021-keyless-agent-session-auth-and-db-bootstrap.md` | Keyless agent-session auth to GCP/Cloud SQL, and the IAM-user privilege bootstrap [adr, now `adr-0021`] |
| `stack-cloud-sql-keyless-iam` | techstack | `doc:decisions/0015-gcp-hosting-cloud-sql-event-store.md` | GCP hosting — one Cloud SQL Postgres for the runtime store; corpus stays in git [adr, now `adr-0015`] |
| `stack-dbos-postgres` | techstack | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `stack-dbos-postgres` | techstack | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `stack-dbos-postgres` | techstack | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `stack-pi-coding-agent` | techstack | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `stack-pi-coding-agent` | techstack | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `stack-pi-coding-agent` | techstack | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `stack-pi-coding-agent` | techstack | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `stack-pi-coding-agent` | techstack | `doc:decisions/0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md` | Add a ChatGPT-subscription Codex prove-it leaf [adr, now `adr-0232`] |
| `stack-pi-coding-agent` | techstack | `asset:stack-claude-agent-sdk` | Claude and Codex subscription live runtimes [techstack] |
| `stack-pixijs-react-studio` | techstack | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `stack-pixijs-react-studio` | techstack | `doc:decisions/0036-story-world-studio-visualisation.md` | The story world — the studio renders the work hierarchy as a hex-island world (SVG, not PixiJS) [adr, now `adr-0036`] |
| `stack-pixijs-react-studio` | techstack | `doc:decisions/0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md` | Parameterise the forest-world geometry as a procedural pipeline (stay on SVG) [adr, now `adr-0069`] |
| `stack-typescript-node-pnpm` | techstack | `doc:decisions/0001-foundational-stack.md` | Foundational stack — pi + a thin durable orchestrator, no framework [adr, now `adr-0001`] |
| `stage-the-attestation-experience` | process | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `stage-the-attestation-experience` | process | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `stage-the-attestation-experience` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `stage-the-attestation-experience` | process | `doc:decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` | Agent-memory graduates into the Library — the outer loop's working notes feed the durable substrate [adr, now `adr-0095`] |
| `stage-the-attestation-experience` | process | `asset:attempt-privileged-actions-approve-inline` | Attempt privileged actions, approve inline [process] |
| `stage-the-attestation-experience` | process | `asset:frontend-builder` | frontend-builder [agent] |
| `stage-the-attestation-experience` | process | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `stage-the-attestation-experience` | process | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `stage-the-attestation-experience` | process | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `stage-the-attestation-experience` | process | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `stage-the-attestation-experience` | process | `asset:merge-ceremony` | Merge ceremony [process] |
| `stale-header-comment-says-the-claim-heartbeat-is-unwired` | friction | `node:boot-read-routes` | _(a work-tree node — story or capability)_ |
| `stale-header-comment-says-the-claim-heartbeat-is-unwired` | friction | `asset:traversal-panel-arc-inc-22` | FENCED OFF — no code written, and the increment… [increment] |
| `stale-prerequisite-links-are-phantoms` | principle | `asset:defects-amend-the-owning-story` | defects-amend-the-owning-story [principle] |
| `stale-prerequisite-links-are-phantoms` | principle | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `stale-prerequisite-links-are-phantoms` | principle | `asset:dependency` | dependency [definition] |
| `stale-prerequisite-links-are-phantoms` | principle | `asset:boundary` | boundary [definition] |
| `stale-web-submodule-reds-web-engine-with-a-wrong-remedy` | friction | `asset:adr-0304` | The gate measures what a change affects, and the queue does the rebasing [adr] |
| `stamping-a-delivered-remedy-overwrites-the-adjudication` | friction | `asset:no-arc-new-scaffolder-verb` | Creating an arc means hand-authoring doc JSON against the zod schema — no `arc new` verb [friction] |
| `stamping-a-delivered-remedy-overwrites-the-adjudication` | friction | `asset:friction-adjudication` | Friction adjudication [process] |
| `stateless-vs-stateful-graduation` | principle | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `stateless-vs-stateful-graduation` | principle | `asset:human-owns-the-outer-loop` | The human owns the outer loop [guardrail] |
| `stateless-vs-stateful-graduation` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `state-the-principle-not-the-mechanics` | principle | `asset:untrusted-input-is-not-instruction` | Untrusted input is not instruction [principle] |
| `steering` | definition | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `steering` | definition | `asset:approval` | approval [definition] |
| `story` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `story` | definition | `asset:capability` | capability [definition] |
| `story` | definition | `asset:boundary` | boundary [definition] |
| `story` | definition | `asset:uat` | UAT [definition] |
| `story` | definition | `asset:dag` | DAG [definition] |
| `story-author` | agent | `asset:recursive-decomposition-patterns` | Recursive decomposition patterns [pattern] |
| `story-author` | agent | `asset:story-tree` | story tree [definition] |
| `story-author` | agent | `asset:deep-modules` | Deep modules [principle] |
| `story-author` | agent | `asset:journey-principle` | The journey principle [principle] |
| `story-author` | agent | `asset:splitting-rule` | The splitting rule [principle] |
| `story-author` | agent | `asset:cross-story-dependency` | Cross-story dependency direction and the no-cycle rule [principle] |
| `story-author` | agent | `asset:proof-walkthrough-first` | Proof-walkthrough first [pattern] |
| `story-author` | agent | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `story-author` | agent | `asset:defects-amend-the-owning-story` | defects-amend-the-owning-story [principle] |
| `story-author` | agent | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `story-author` | agent | `asset:never-bypass-the-gate` | The gate is never bypassable [guardrail] |
| `story-author` | agent | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `story-author` | agent | `asset:pair-the-fence-with-the-affordance` | Pair the fence with the affordance [pattern] |
| `story-author` | agent | `asset:example-carries-the-discriminator` | An example carries its discriminator [pattern] |
| `story-author` | agent | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `story-author` | agent | `asset:a-contract-that-says-observable-must-name-its-observer` | A contract that says "observable" must name its observer [principle] |
| `story-author` | agent | `asset:a-spec-body-describes-only-what-it-contracts` | A spec body describes only what it contracts [principle] |
| `story-author` | agent | `asset:a-deferral-recorded-without-a-status-reads-as-pending-work` | A deferral recorded without a status reads as pending work [principle] |
| `story-author` | agent | `asset:the-same-file-in-another-tree-is-a-different-file` | The same file in another tree is a different file [principle] |
| `story-author` | agent | `asset:cold-rebuild` | cold-rebuild [principle] |
| `story-author` | agent | `asset:one-way-to-do-things` | One way to do things [principle] |
| `story-capability-add-reds-a-pinned-topo-order` | friction | `node:library` | _(a work-tree node — story or capability)_ |
| `story-grain-file-ownership-has-no-claimable-owner` | friction | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `story-grain-file-ownership-has-no-claimable-owner` | friction | `doc:decisions/0317-code-ownership-is-a-declared-map-held-to-the-disk-by-a-total.md` | Code ownership is a declared map held to the disk by a totality check, at every grain [adr, now `adr-0317`] |
| `story-load-failure-renders-as-unknown` | friction | `node:terminal-tabs` | _(a work-tree node — story or capability)_ |
| `story-tree` | definition | `doc:decisions/0002-work-hierarchy-story-capability-contract.md` | The work hierarchy — story, capability, contract [adr, now `adr-0002`] |
| `story-tree` | definition | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `story-tree` | definition | `doc:decisions/0033-session-presence-notice-board.md` | The notice board is session presence — advisory coordination for parallel sessions [adr, now `adr-0033`] |
| `story-tree` | definition | `asset:story` | story [definition] |
| `story-tree` | definition | `asset:capability` | capability [definition] |
| `story-tree` | definition | `asset:contract` | contract [definition] |
| `story-tree` | definition | `asset:dag` | DAG [definition] |
| `story-tree` | definition | `asset:node` | node [definition] |
| `story-tree` | definition | `asset:lifecycle-status` | lifecycle status [definition] |
| `story-tree` | definition | `asset:prove-it-gate` | Prove-it gate [principle] |
| `story-tree` | definition | `asset:studio` | studio [definition] |
| `story-tree` | definition | `asset:library` | library [definition] |
| `story-tree` | definition | `asset:noticeboard` | noticeboard [definition] |
| `storytree-own-lists-work-its-own-stop-refuses` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `studio-server-does-not-hydrate-secrets-so-local-hosted-runs-misreport` | friction | `doc:decisions/0042-hosted-studio-demo-cloud-run-iap.md` | Serve the studio to a trusted circle — Cloud Run + IAP, read+comment guests [adr, now `adr-0042`] |
| `studio-server-does-not-hydrate-secrets-so-local-hosted-runs-misreport` | friction | `asset:diagnosis-honesty-arc` | Diagnosis honesty — a command names its real blocker, not the substrate [arc] |
| `subagent-context-pull` | process | `doc:decisions/0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md` | Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time [adr, now `adr-0156`] |
| `subagent-context-pull` | process | `doc:decisions/0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md` | The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter [adr, now `adr-0161`] |
| `subagent-context-pull` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `subagent-context-pull` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `subagent-context-pull` | process | `doc:decisions/0023-library-cli-choose-your-own-adventure.md` | Agents reach the Library through an exploratory, just-in-time CLI [adr, now `adr-0023`] |
| `subagent-context-pull` | process | `asset:pull-based-context-architecture` | Pull-based context architecture [pattern] |
| `subagent-context-pull` | process | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `subagent-context-pull` | process | `asset:escalate-up-when-blocked-or-out-of-scope` | Escalate UP when blocked or out of scope [guardrail] |
| `summary-type-mirrored-in-studio-fold-with-no-mechanical-link` | friction | `node:traversal-trace-sink` | _(a work-tree node — story or capability)_ |
| `summary-type-mirrored-in-studio-fold-with-no-mechanical-link` | friction | `node:traversal-session-query` | _(a work-tree node — story or capability)_ |
| `surfaces-prose-example-parses-as-a-declared-entrypoint` | friction | `asset:affected-pr-test-scope` | Affected-only PR test scope [process] |
| `surfaces-prose-example-parses-as-a-declared-entrypoint` | friction | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `survival-test-for-adrs` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `sync-corpus-on-a-stale-seed-resurrects` | friction | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `sync-corpus-resurrects-a-sibling-lane-retire` | friction | `asset:cli-write-fidelity-arc` | CLI write fidelity [arc] |
| `tagged-side-deploy-pins-the-members-facing-services-traffic` | friction | `node:deploy-on-merge` | _(a work-tree node — story or capability)_ |
| `taskstop-kills-the-wrapper-and-leaves-the-detached-child-holding-the-port` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `terminal-orchestrator-seat-arc` | arc | `doc:docs/decisions/0174-interactive-builds-run-in-an-in-app-terminal-not-the-in-app.md` | Interactive builds run in an in-app terminal, not the in-app orchestrator [adr, now `adr-0174`] |
| `terminal-orchestrator-seat-arc` | arc | `doc:docs/decisions/0186-the-embedded-terminal-is-multi-session-with-tabs-a-map-build.md` | The embedded terminal is multi-session with tabs; a map Build seed opens a fresh tab, never the active session [adr, now `adr-0186`] |
| `terminal-orchestrator-seat-arc` | arc | `doc:docs/decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md` | Repurpose (don't delete) the in-app orchestrator chat infrastructure into the app-guide agent [adr, now `adr-0175`] |
| `terminal-orchestrator-seat-arc` | arc | `doc:docs/decisions/0189-terminal-pty-sessions-are-app-owned-route-changes-re-attach.md` | Terminal pty sessions are app-owned: route changes re-attach, only tab-close and app-quit kill [adr, now `adr-0189`] |
| `terminal-orchestrator-seat-arc` | arc | `asset:desktop-terminal-pivot-arc` | Desktop terminal pivot + self-updating distribution [arc] |
| `test-creation-principles` | principle | `asset:reward-hacking` | Reward hacking [principle] |
| `test-creation-principles` | principle | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `test-creation-principles` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `test-creation-principles` | principle | `asset:contract-test` | contract test [definition] |
| `test-creation-principles` | principle | `asset:mock-uat-seam` | mock-UAT seam [definition] |
| `test-fixtures-mirror-production-failure-modes` | principle | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `test-fixtures-mirror-production-failure-modes` | principle | `asset:tightening-a-shared-contract-needs-a-full-sweep` | Tightening a shared contract needs a full sweep [principle] |
| `test-fixtures-mirror-production-failure-modes` | principle | `asset:mock-uat-seam` | mock-UAT seam [definition] |
| `test-fixtures-mirror-production-failure-modes` | principle | `asset:a-mocked-seam-leaves-its-default-implementation-unproven` | A mocked seam leaves its default implementation unproven [principle] |
| `test-fixtures-mirror-production-failure-modes` | principle | `asset:pin-the-dual-runtime-import-form` | The published surface is not evidence of runtime shape -- probe, then pin [pattern] |
| `the-board-says-no-live-claims-while-the-unit-view-shows-them` | friction | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `the-per-project-test-cost-table-is-hand-rolled-every-time` | friction | `node:unified-command-dispatch` | _(a work-tree node — story or capability)_ |
| `the-pre-merge-librarian-pass-stales-the-gate-that-certified-the-unit` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `the-pre-merge-librarian-pass-stales-the-gate-that-certified-the-unit` | friction | `doc:decisions/0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md` | The agent renderer shapes CLAUDE.md and the leaf prompt from library agents [adr, now `adr-0051`] |
| `the-pre-merge-librarian-pass-stales-the-gate-that-certified-the-unit` | friction | `node:library-cli` | _(a work-tree node — story or capability)_ |
| `the-reader-chooses-the-thread-and-the-depth` | principle | `asset:show-what-matters-at-this-stage` | Show what matters at the stage they are at [principle] |
| `the-reader-chooses-the-thread-and-the-depth` | principle | `asset:signals-must-be-real` | Signals must be real [principle] |
| `the-recurrence-extinction-success-signal-has-no-instrument` | friction | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `the-recurrence-extinction-success-signal-has-no-instrument` | friction | `asset:friction-adjudication` | Friction adjudication [process] |
| `the-recurrence-extinction-success-signal-has-no-instrument` | friction | `asset:factory-floor-health-arc` | Factory-floor health — is the factory getting better, and can a command say so? [arc] |
| `the-resting-view-is-designed-not-fitted` | principle | `asset:legible-at-the-resting-view` | Legible at the resting view [principle] |
| `the-resting-view-is-designed-not-fitted` | principle | `asset:deterministic-parameterised-geometry` | Deterministic, parameterised geometry [principle] |
| `the-resting-view-is-designed-not-fitted` | principle | `asset:decide-against-a-standard-not-a-budget` | Decide against a standard, not a budget [principle] |
| `the-resting-view-is-designed-not-fitted` | principle | `doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` | Frontend as an inner-loop role: the two-stage proof for visual surfaces [adr, now `adr-0070`] |
| `the-resting-view-is-designed-not-fitted` | principle | `doc:decisions/0367-chapter-2-s-land-is-rendered-in-blender-too-an-angled-citybu.md` | Chapter 2's land is rendered in Blender too: an angled citybuilder map from author-time 3D tiles at one declared camera [adr, now `adr-0367`] |
| `the-resting-view-is-designed-not-fitted` | principle | `asset:adr-0471` | Both maps open on a designed resting frame, pinned to island size [adr] |
| `the-resting-view-is-designed-not-fitted` | principle | `asset:frontend-appearance-repair-arc` | The forest map is legible again, and the instruments that judge it are honest [arc] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:verify-edit-write-persisted-or-escalate` | Verify an edit persisted, or escalate [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:an-inherited-precondition-holds-only-where-and-when-it-was-authored` | An inherited precondition holds only where and when it was authored [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:authoritative-source-beats-derived` | The authoritative source beats the derived one [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:work-hierarchy-is-disk-canonical` | work hierarchy is disk-canonical [definition] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:state-the-principle-not-the-mechanics` | State the principle, not the mechanics [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `asset:claim-the-owning-story` | Claim by write-ownership — at capability grain [principle] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `doc:decisions/0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md` | The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral [adr, now `adr-0255`] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `doc:decisions/0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md` | The write-authority wall is agent-inescapable and binds shared checkouts [adr, now `adr-0257`] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `doc:decisions/0245-cross-session-signalling-addresses-the-shared-primary-checko.md` | Cross-session signalling addresses the shared primary checkout, not a session [adr, now `adr-0245`] |
| `the-same-file-in-another-tree-is-a-different-file` | principle | `doc:decisions/0031-real-pass-promotion-and-worktree-deps.md` | A signed REAL pass is promoted, not evaporated — branch-per-pass landing + dependency-bearing worktrees [adr, now `adr-0031`] |
| `thin-wrapper-over-the-runtime` | pattern | `doc:decisions/0004-orchestrator-agent-boundary.md` | Orchestrator/agent boundary [adr, now `adr-0004`] |
| `thin-wrapper-over-the-runtime` | pattern | `doc:decisions/0006-event-store-observability-surface.md` | Event store & observability surface [adr, now `adr-0006`] |
| `thin-wrapper-over-the-runtime` | pattern | `doc:decisions/0011-own-the-agent-loop-and-context-engineering.md` | Own the agent loop and context engineering [adr, now `adr-0011`] |
| `three-sessions-dispatched-onto-one-refuted-worklist` | friction | `asset:uat-drive-provider-back-to-claude` | **LANDED (#1621, ADR-0435).** UAT walks now default to the **Claude**… [increment] |
| `three-sessions-dispatched-onto-one-refuted-worklist` | friction | `node:studio-build` | _(a work-tree node — story or capability)_ |
| `tightening-a-shared-contract-needs-a-full-sweep` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `tightening-a-shared-contract-needs-a-full-sweep` | principle | `asset:prose-names-a-set-it-never-checked` | Prose names a set it never checked [principle] |
| `tightening-a-shared-contract-needs-a-full-sweep` | principle | `asset:exploration-principles` | Exploration principles [principle] |
| `tightening-a-shared-contract-needs-a-full-sweep` | principle | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:dogfood-fix-the-source` | Dogfood: fix the source [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:frontend-perf-measured-on-the-vite-dev-server-misattributes-the-cost` | A frontend frame-cost measurement taken on the Vite dev server misattributes where the cost is [friction] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:a-green-positional-oracle-is-necessary-not-sufficient` | A green positional oracle is necessary, not sufficient [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:revalidate-instruments-when-a-decision-widens-a-domain` | Revalidate the instruments when a decision widens a domain [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `asset:no-claim-without-evidence` | No claim without evidence [principle] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `doc:decisions/0240-studio-map-responsiveness-cache-and-defer-before-cutting-den.md` | Studio map responsiveness — cache and defer before cutting density [adr, now `adr-0240`] |
| `trace-the-defect-to-its-producing-stage-before-building` | principle | `doc:decisions/0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md` | A forest-map pan frame is rasterisation, not density — pan moves off the SVG transform [adr, now `adr-0272`] |
| `traversal-index-read-outruns-its-own-client-timeout` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `traversal-index-read-outruns-its-own-client-timeout` | friction | `asset:observability-first` | Observability-first [principle] |
| `trunk` | definition | `doc:decisions/0008-ui-drives-agents-approvals.md` | UI drives agents — approval-gated trunk [adr, now `adr-0008`] |
| `trunk` | definition | `asset:approval-gated-trunk` | Approval-gated trunk [guardrail] |
| `turn-budget-keys-on-assert-surface` | pattern | `doc:decisions/0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md` | Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake) [adr, now `adr-0130`] |
| `turn-budget-keys-on-assert-surface` | pattern | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `two-anti-slop-rules-collide-on-required-plus-conditional-optional` | friction | `asset:adr-0407` | Adopt the anti-slop rule set as the house TypeScript standard, one rule at a time [adr] |
| `two-anti-slop-rules-collide-on-required-plus-conditional-optional` | friction | `doc:typescript-standard.md` | _(a repo path, not a library row)_ |
| `two-consumer-extraction` | principle | `asset:reference-dont-restate` | Reference, don't restate [principle] |
| `two-consumer-extraction` | principle | `asset:deep-modules` | Deep modules [principle] |
| `two-consumer-extraction` | principle | `asset:edit-first-curation` | Edit-first curation [pattern] |
| `two-definitions-in-one-tier-can-contradict-with-no-detector` | friction | `asset:adr-0403` | The decision log becomes ordinary artifacts in Postgres, and open-sourcing is deferred [adr] |
| `two-definitions-in-one-tier-can-contradict-with-no-detector` | friction | `asset:adr-0139` | The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance [adr] |
| `two-definitions-in-one-tier-can-contradict-with-no-detector` | friction | `asset:accepted-adrs-carry-no-stale-prose` | Accepted ADRs carry no stale prose [principle] |
| `two-sessions-in-one-worktree-collapse-to-one-identity` | friction | `asset:an-unattributable-observation-is-not-evidence` | An unattributable observation is not evidence [guardrail] |
| `two-sessions-in-one-worktree-collapse-to-one-identity` | friction | `asset:claims-in-the-shared-store` | Claims live in the shared store [guardrail] |
| `two-sessions-in-one-worktree-collapse-to-one-identity` | friction | `asset:observability-first` | Observability-first [principle] |
| `two-surfaces-required-to-agree-are-gated` | guardrail | `asset:verification-wins` | verification-wins [principle] |
| `two-surfaces-required-to-agree-are-gated` | guardrail | `doc:decisions/0249-oracle-report-freshness-an-unattributable-observation-is-not.md` | Oracle-report freshness: an unattributable observation is not evidence [adr, now `adr-0249`] |
| `two-surfaces-required-to-agree-are-gated` | guardrail | `doc:decisions/0251-mirror-conformance-two-surfaces-required-to-agree-are-gated.md` | Mirror conformance: two surfaces required to agree are gated by a test that compares them [adr, now `adr-0251`] |
| `type-only-red-needs-runtime-witness` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `type-only-red-needs-runtime-witness` | process | `doc:decisions/0140-library-review-mode-inline-block-anchored-comments-and-sugge.md` | Library Review mode — inline block-anchored comments and suggestion-based edits [adr, now `adr-0140`] |
| `type-only-red-needs-runtime-witness` | process | `asset:prove-and-promote-ceremony` | Prove-and-promote ceremony [process] |
| `type-only-red-needs-runtime-witness` | process | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `uat` | definition | `doc:decisions/0010-organism-model-story-bounded-context.md` | The organism model — story as bounded context, the proof ladder, and cross-story interfaces [adr, now `adr-0010`] |
| `uat` | definition | `asset:story` | story [definition] |
| `uat` | definition | `asset:proof-mode` | Proof mode [definition] |
| `uat` | definition | `asset:verdict` | verdict [definition] |
| `uat-census-counts-human-legs-but-will-not-name-them` | friction | `asset:machine-verdict-approver-arc` | When does this system actually require a human? [arc] |
| `uat-census-counts-human-legs-but-will-not-name-them` | friction | `asset:stage-1-absorbs-the-non-taste-arc` | Stage 1 absorbs what is adjacent to taste [arc] |
| `uat-drive-attaches-to-a-sibling-worktrees-studio` | friction | `node:studio-build` | _(a work-tree node — story or capability)_ |
| `uat-drive-attaches-to-a-sibling-worktrees-studio` | friction | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `uat-drive-attaches-to-a-sibling-worktrees-studio` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `uat-drive-exit-zero-is-not-signed-proof` | friction | `node:embedded-terminal` | _(a work-tree node — story or capability)_ |
| `uat-drive-exit-zero-is-not-signed-proof` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `uat-drive-launch-refusal-persists-nothing-for-the-next-box` | friction | `node:embedded-terminal` | _(a work-tree node — story or capability)_ |
| `uat-drive-launch-refusal-persists-nothing-for-the-next-box` | friction | `asset:uat-drive-embedded-terminal-real-pty` | Drive Embedded Terminal’s real-PTY journey [increment] |
| `uat-drive-releases-the-driving-sessions-claims` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `uat-drive-releases-the-driving-sessions-claims` | friction | `doc:decisions/0346-the-capability-claim-becomes-a-real-fence-waiting-binds-stor.md` | The capability claim becomes a real fence: waiting binds, story-grain session claims retire [adr, now `adr-0346`] |
| `uat-drive-session-parks-on-a-poll-and-reports-nothing` | friction | `node:embedded-terminal` | _(a work-tree node — story or capability)_ |
| `uat-drive-session-parks-on-a-poll-and-reports-nothing` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `uat-drive-walk-outlives-its-own-session` | friction | `node:studio-build` | _(a work-tree node — story or capability)_ |
| `uat-drive-walk-outlives-its-own-session` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `uat-drive-walk-outlives-its-own-session` | friction | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `uat-list-shows-no-story-status-so-a-retired-crown-reads-green` | friction | `node:studio-build` | _(a work-tree node — story or capability)_ |
| `uat-list-shows-no-story-status-so-a-retired-crown-reads-green` | friction | `node:desktop-build-mount` | _(a work-tree node — story or capability)_ |
| `uat-list-shows-no-story-status-so-a-retired-crown-reads-green` | friction | `asset:adr-0429` | Retire stories/studio-build — the UI-driven build story whose journey ADR-0404 reversed [adr] |
| `uat-list-shows-no-story-status-so-a-retired-crown-reads-green` | friction | `asset:adr-0404` | Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances [adr] |
| `uat-proves-the-goal-not-the-surface` | principle | `doc:decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md` | Proof paints the world — verdict-derived green and the human-witness signpost [adr, now `adr-0040`] |
| `uat-proves-the-goal-not-the-surface` | principle | `asset:uat` | UAT [definition] |
| `uat-proves-the-goal-not-the-surface` | principle | `asset:slow-growth-minimum-to-green` | Slow growth: the minimum to green [principle] |
| `uat-proves-the-goal-not-the-surface` | principle | `asset:operator-attested` | operator-attested [definition] |
| `uat-proves-the-goal-not-the-surface` | principle | `asset:defects-amend-the-owning-story` | defects-amend-the-owning-story [principle] |
| `uat-proves-the-goal-not-the-surface` | principle | `asset:human-witness-is-a-judgment-gap-not-cost` | The human witness label is for a judgment gap, never cost [principle] |
| `uat-proves-the-goal-not-the-surface` | principle | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `uat-run-re-observes-the-same-command-once-per-leg` | friction | `node:studio` | _(a work-tree node — story or capability)_ |
| `uat-run-re-observes-the-same-command-once-per-leg` | friction | `asset:uat-journey-surgery-arc` | Story UAT is a journey — the ADR-0294 criteria surgery [arc] |
| `uat-witness-tag-has-two-written-forms-grep-undercounts` | friction | `doc:decisions/0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md` | Human UAT witness narrows to taste — live-spend and outward-facing legs default to machine [adr, now `adr-0348`] |
| `uat-witness-tag-has-two-written-forms-grep-undercounts` | friction | `doc:decisions/0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md` | The UAT driver's own verdict is the witness — model-driven UAT by default [adr, now `adr-0295`] |
| `unit-fields` | definition | `doc:decisions/0019-library-tier-name-and-defer-dbos.md` | The knowledge tier is named "library"; defer DBOS for its store [adr, now `adr-0019`] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:right-kind-red` | The red must be the right kind [guardrail] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:red-green` | red-green [principle] |
| `unrun-check-is-unverified-not-refuted` | principle | `doc:decisions/0007-proof-model.md` | Proof model [adr, now `adr-0007`] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:deep-research-verifier-failure-reads-as-refutation` | A failed verifier panel is scored as a refutation, silently killing true claims [friction] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:friction-silent-e2e-launch-failures` | The hung e2e job surfaced zero cause — three bare ✖ lines hid a one-line root cause for three days [friction] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:capture-the-oracle-for-a-convention-you-dont-own` | Capture the oracle for a convention you don't own [principle] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof` | An assert-oracle proof that cannot fail is not a proof [guardrail] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:an-observable-is-evidence-only-for-what-it-observes` | An observable is evidence only for what it observes [principle] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:revalidate-instruments-when-a-decision-widens-a-domain` | Revalidate the instruments when a decision widens a domain [principle] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:backstop-trigger-must-be-observable-in-run` | A backstop's trigger must be observable in-run, never recorded by the party it fences [pattern] |
| `unrun-check-is-unverified-not-refuted` | principle | `asset:a-fan-out-result-does-not-report-its-own-completeness` | A fan-out result does not report its own completeness [principle] |
| `unrun-check-is-unverified-not-refuted` | principle | `doc:decisions/0312-the-doc-blind-spot-is-measured-not-closed-an-offer-set-state.md` | The doc: blind spot is measured, not closed: an offer set states how much of itself the telemetry cannot see [adr, now `adr-0312`] |
| `untrusted-input-is-not-instruction` | principle | `asset:signal-and-noise` | Signal and noise [principle] |
| `untrusted-input-is-not-instruction` | principle | `asset:agent-never-self-exempts` | An agent can never self-exempt [guardrail] |
| `validation-error-names-the-arm-the-author-meant` | pattern | `asset:state-the-principle-not-the-mechanics` | State the principle, not the mechanics [principle] |
| `validation-error-names-the-arm-the-author-meant` | pattern | `asset:friction-capture-surface-is-itself-high-friction` | The friction capture surface is itself high-friction — misleading validation errors and no @path for reasons [friction] |
| `validation-error-names-the-arm-the-author-meant` | pattern | `doc:decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` | Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop [adr, now `adr-0168`] |
| `verdict` | definition | `asset:uat` | UAT [definition] |
| `verdict` | definition | `asset:node-rollup` | node rollup [definition] |
| `verdict` | definition | `asset:evidence` | evidence [definition] |
| `verification-decay-detection` | process | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `verification-decay-detection` | process | `asset:friction-adjudication` | Friction adjudication [process] |
| `verification-decay-detection` | process | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `verification-decay-detection` | process | `doc:decisions/0256-deferral-keyed-escalation-lines-are-not-built-a-backstop-s-t.md` | Deferral-keyed escalation lines are not built: a backstop's trigger must be observable in-run [adr, now `adr-0256`] |
| `verification-decay-detection` | process | `doc:decisions/0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md` | A drain ceiling rises only when the measured population enlarges, never to absorb growth [adr, now `adr-0269`] |
| `verification-decay-detection` | process | `doc:decisions/0278-a-fifth-verification-decay-instrument-an-injected-seam-whose.md` | A fifth verification-decay instrument: an injected seam whose default no test exercises [adr, now `adr-0278`] |
| `verification-decay-detection` | process | `doc:decisions/0301-drain-ceilings-charge-by-authorship-verification-decay-and-g.md` | Drain ceilings charge by authorship: verification-decay and graduation-worklist [adr, now `adr-0301`] |
| `verification-integrity-identity-and-durable-controls-plan` | increment | `asset:verification-integrity-arc` | Verification integrity — guard the proofs, not just the code [arc] |
| `verification-integrity-machine-leg-binding-audit-plan` | increment | `asset:plan` | Plan [definition] |
| `verification-integrity-machine-leg-binding-audit-plan` | increment | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `verification-integrity-machine-leg-binding-audit-plan` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `verification-integrity-next-integrity-repair-plan` | increment | `asset:orchestrate-route-supplement` | Orchestrate, route, supplement: the inner loop is one tool [pattern] |
| `verification-integrity-next-integrity-repair-plan` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `verification-integrity-next-integrity-repair-plan` | increment | `asset:route-structural-forks-to-story-author` | Route structural forks to story-author, not the owner [principle] |
| `verification-integrity-next-integrity-repair-plan` | increment | `asset:owner-fork-bar` | The owner-fork bar: escalate ownership, not uncertainty [principle] |
| `verification-integrity-proof-binding-contract-and-audit-plan` | increment | `asset:plan` | Plan [definition] |
| `verification-integrity-proof-binding-contract-and-audit-plan` | increment | `asset:anchor-implementation-surface` | Implementation surface is written only into anchored, disposable artifacts [principle] |
| `verification-integrity-proof-binding-contract-and-audit-plan` | increment | `asset:turn-budget-keys-on-assert-surface` | The --real turn budget keys on the assert surface, not file size [pattern] |
| `verify-edit-write-persisted-or-escalate` | principle | `asset:implementer-shortcut-patterns` | Implementer shortcut patterns [pattern] |
| `verify-edit-write-persisted-or-escalate` | principle | `asset:test-fixtures-mirror-production-failure-modes` | Test fixtures mirror production failure modes [principle] |
| `verify-edit-write-persisted-or-escalate` | principle | `doc:decisions/0030-all-in-on-claude-agent-sdk.md` | Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture) [adr, now `adr-0030`] |
| `web-engine-check-reports-pass-when-it-cannot-see-its-subject` | friction | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
| `website-release` | process | `doc:decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md` | Bring consuming surfaces — apps and the public website subrepo — into the boundary graph [adr, now `adr-0100`] |
| `website-release` | process | `doc:decisions/0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md` | Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate [adr, now `adr-0056`] |
| `website-release` | process | `doc:decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md` | Shared forest-world render core for studio and the public website [adr, now `adr-0093`] |
| `website-release` | process | `doc:decisions/0034-process-artifacts-ways-of-working.md` | `process` artifacts — ways-of-working as a downstream library kind [adr, now `adr-0034`] |
| `website-release` | process | `doc:decisions/0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md` | librarian-curator owns the process tier as a standing projection of the decision log [adr, now `adr-0154`] |
| `website-release` | process | `asset:merge-ceremony` | Merge ceremony [process] |
| `web-submodule-has-no-typechecker-so-a-synced-split-shipped-undefined` | friction | `asset:adr-0093` | Shared forest-world render core for studio and the public website [adr] |
| `web-submodule-has-no-typechecker-so-a-synced-split-shipped-undefined` | friction | `asset:adr-0123` | WebGL forest-world renderer via react-three-fiber, website-first [adr] |
| `web-submodule-has-no-typechecker-so-a-synced-split-shipped-undefined` | friction | `doc:research/forest-snapshot-2026-08-28/README.md` | _(a repo path, not a library row)_ |
| `workflow-death-strands-expensive-artifacts-unsynthesised` | friction | `doc:research/chapter2-code-only-art-2026-08-01/VERDICT.md` | _(a repo path, not a library row)_ |
| `workflow-death-strands-expensive-artifacts-unsynthesised` | friction | `node:app-surface` | _(a work-tree node — story or capability)_ |
| `work-hierarchy-is-disk-canonical` | definition | `asset:story` | story [definition] |
| `work-hierarchy-is-disk-canonical` | definition | `asset:capability` | capability [definition] |
| `work-hierarchy-is-disk-canonical` | definition | `asset:live-store-is-the-edit-surface` | The live store is the edit surface [guardrail] |
| `work-hierarchy-is-disk-canonical` | definition | `doc:decisions/0039-json-structured-source-format.md` | JSON is the structured corpus source format — the pure-YAML unit migration is retired [adr, now `adr-0039`] |
| `worktree-command-guard-blames-git-for-a-command-with-no-git` | friction | `doc:decisions/0033-session-presence-notice-board.md` | The notice board is session presence — advisory coordination for parallel sessions [adr, now `adr-0033`] |
| `write-ownership` | definition | `doc:decisions/0009-concurrency-isolation-id-allocation.md` | Concurrency, isolation & ID allocation [adr, now `adr-0009`] |
| `write-ownership` | definition | `asset:claim` | claim [definition] |
| `wsl-bash-shadows-git-bash-and-127s-the-gate-suite` | friction | `node:cli` | _(a work-tree node — story or capability)_ |
| `wsl-bash-shadows-git-bash-and-127s-the-gate-suite` | friction | `asset:merge-ceremony` | Merge ceremony [process] |
| `zero-ceiling-corpus-gate-races-concurrent-live-authoring` | friction | `asset:library-edit-ceremony` | Library edit ceremony [process] |
| `zero-ceiling-corpus-gate-races-concurrent-live-authoring` | friction | `doc:decisions/0252-verification-decay-detection-continuous-mechanical-warns-a-j.md` | Verification-decay detection: continuous mechanical warns, a judgment-gated adversarial pass in a fresh session [adr, now `adr-0252`] |
