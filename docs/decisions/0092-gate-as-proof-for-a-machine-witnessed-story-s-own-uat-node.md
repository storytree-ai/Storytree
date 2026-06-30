---
status: accepted
decided: 2026-06-22
amends: [59, 87]
---
# ADR-0092: Gate-as-proof for a machine-witnessed story's own UAT node

## Status

accepted (2026-06-22) — direct owner decision: unblock building the `library` story from the studio's
story-level Build (ADR-0090/0091), and on the design fork the owner chose **gate-as-proof on the story
node + amend ADR-0087's scope bound to permit authoring-doc roots** (over a registry-borne arm that
would avoid touching ADR-0087). This **amends** [ADR-0059](0059-gate-as-proof-authoring-nodes-earn-a-signed-verdict-via-thei.md)
(extends gate-as-proof from ADR-authoring to STORY-authoring, its §4 expansion path) and
[ADR-0087](0087-spec-borne-write-scope-is-bounded-structurally-not-by-pr-dif.md) (widens the
structural scope bound to authoring-doc roots), without overturning either.

**Correction ([ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md), per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** decision 1's studio-**Build** button-lighting purpose and decision 5's brownfield-`real:`-arm buildability are overtaken — the library's green path is **Adopt** / `## Reliability Gates` (ADR-0085), not a brownfield drive. The gate-as-proof MECHANISM (decision 1 — the `real:` arm over `stories/<story>/story.md`, the AUTHOR_TEST→…→GATE ladder) and decisions 2 (`storyUatCompleteness` spec hygiene), 3 (node-verdict ≠ story-green-crown), and 4 (the ADR-0087 scope-bound amendment) STAND. The body spots that carried the overtaken purpose are corrected below (Context, Decision 5, Consequences).

## Context

The studio's story-level Build (ADR-0090/0091) runs `storytree story build <id> --real`. For the
studio to offer it, `isStoryBuildable(<id>, caps, 'real')` must be true — every DRIVEN node must carry
a `real:` arm. The `library` story is `uat_witness: machine`, so under ADR-0040 its OWN UAT node is
**driven, not withheld** (the machine may witness its own UAT). That story node had no `real:` arm, and
neither did any of its 7 capabilities (all registry-only, dry-run/live buildable but not real). So
`story build library --real` was refused before any worktree — the studio could not offer the build.

This was a KNOWN gap, named in [`story-real-chain`](../../stories/drive-machinery/story-real-chain.md):
"a machine-witnessed story whose UAT node lacks a `real:` arm is REFUSED … (a story UAT as a
gate-as-proof node is expansion E, ADR-0057 §5)." This ADR fills that hole. *(The
studio-Build-for-the-library outcome is overtaken by [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — Adopt is the
library's green path; the gate-as-proof mechanism introduced here stands.)*

The hard part is the story node, not the capabilities. A capability's `real:` arm is an ordinary
edit-existing proof against its package source. But a STORY's UAT is not a test-file red→green — it is
an acceptance walkthrough. The owner's choice (ADR-0057 §5, ADR-0059) is **gate-as-proof**: an
authoring node's proof is the structural gate that guards the artifact staying valid. ADR-0059 made
that literal for ADRs (the `adrCompleteness` check over a `docs/decisions/NNNN-slug.md` doc); its §4
named the next kinds — library-edit, then **story-authoring**. This ADR is that story-authoring kind.

Two structural facts make it nearly free:
- The prove-it-gate is **tier-agnostic** — `resolveProveSpec` / `proveUnit` use `spec.tier` only for the
  brief header. The only `tier === "story"` guard is in `topoOrderStoryNodes` (it validates the story
  ROOT, not driving). So a tier:story gate-as-proof node drives through the UNCHANGED gate.
- Gate-as-proof **is edit-existing** (ADR-0057 C / ADR-0059): the spec is the source, a per-artifact
  completeness check is the test, the genuine red is an incomplete spec.

The one real wiring gap: ADR-0087 bounds a spec-borne write scope to ONE concrete `packages/<pkg>/` or
`apps/<app>/`. A gate-as-proof node's source is a DOC outside `packages/` (`stories/<story>/story.md`,
or `docs/decisions/NNNN.md` for ADRs), so the bound refused it.

## Decision

**1. A machine-witnessed story's own UAT node earns a `real:` arm via gate-as-proof over the story
spec.** The arm is `editsExisting: true` over `stories/<story>/story.md`, with a leaf-authored
per-story **completeness test** as the proof. The spine drives the unchanged
`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE` ladder; the verdict carries `proofMode:
"story"`. No new proof mode, field, or phase — the story analog of ADR-0059, proven offline by
`packages/cli/src/gate-as-proof-story.test.ts` (a tier:story node red→green through the gate to a
signed verdict, plus the forged-already-green and AUTHOR_TEST-wall honesty legs).

**2. The completeness contract (`storyUatCompleteness`, `packages/cli/src/story-completeness.ts`)
asserts a STRUCTURALLY COMPLETE, fully-witnessed machine-UAT record** — never that the story is
`healthy`. It requires: the frontmatter parses with `tier: story`, an `outcome`, `proof_mode: UAT`,
`uat_witness: machine`, and a non-empty `capabilities` list; the canonical `## Story UAT` and `## Proof`
sections; ≥1 numbered UAT leg, each naming a `(witness: …)` explicitly (an untagged leg silently
defaults to `either` — incomplete witnessing); and no `<…>` scaffold placeholders. **First story
KIND = a `uat_witness: machine` story** (the library), exactly as ADR-0059's first kind was the ADR — a
human-witnessed story's acceptance is a human ceremony (ADR-0040), a later kind if ever wanted.

**3. The honesty boundary — the node verdict is NOT the story-green crown.** gate-as-proof signs "the
UAT spec is structurally complete and machine-witnessed"; it never signs the story's acceptance. The
story-green **crown** still requires every capability proven `healthy` AND every per-test UAT verdict
signed by its declared witness ([ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) /
[ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md)), which a structural-completeness pass deliberately does
not touch. The machine witnesses authoring HYGIENE, never merit — the same human-flip wall ADR-0059 §3
draws for ADRs (a complete record never asserts acceptance).

**4. Amend ADR-0087: the spec-borne write-scope bound permits authoring-DOC roots.**
`scopeGlobBoundIssue` now accepts `stories/<story>/…` and `docs/decisions/…` (the authoring-doc roots a
gate-as-proof node edits) alongside `packages/<pkg>/` and `apps/<app>/` — bounded IDENTICALLY: one
CONCRETE doc dir, no wildcard package/story segment, no `..` escape, no absolute path. A gate-as-proof
node can no more declare a repo-wide doc scope (`docs/**`, `stories/*/story.md`) than a code node can
declare `packages/*`. Enforcement is unchanged (the phase wall still walls every write spine-side);
only the permitted DECLARATION widens.

**5. The 7 library capabilities gain spec-borne brownfield `real:` arms.** Each carries an
`editsExisting` arm against its real `packages/library` / `packages/cli` source, so the WHOLE chain
(7 capabilities + the story UAT node) is `--real`-buildable and `isStoryBuildable(library, caps,
'real')` is true — the studio offers the story-level Build (ADR-0090/0091). One cap
(`event-sourced-store-seam`) is `db: true` (ADR-0064) — the honest shape for the Postgres Store seam.
*(Overtaken by [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): these brownfield arms
are vestigial for buildability — the library lights **Adopt**, green via `## Reliability Gates` / ADR-0085,
not a brownfield drive. The gate-as-proof story-node mechanism (decision 1) is unaffected.)*

## Consequences

**Good.**
- The studio can offer `story build library --real`; the ADR-0090/0091 story-level Build is unblocked
  for the library organism. *(Overtaken by [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
  per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): the brownfield
  library offers **Adopt**, not Build.)*
- Gate-as-proof generalizes to story authoring (ADR-0059 §4's named path), with the honesty walls
  intact — a story node earns a node + signed verdict + wisp like any build.
- ZERO new engine machinery beyond the scope-bound amendment: the gate is tier-agnostic, `editsExisting`
  / `PathWriteScope` / `commitAuthored` / `gitTreeState` all already carry it. The only net-new code is
  `storyUatCompleteness` (+ the scope-bound widening); the only net-new authored artifacts are the spec
  arms and the per-story completeness test the leaf would author live.

**Bad / costs & surfaced owner calls (not unilaterally decided).**
- **Brownfield "no live red on a mature artifact" (the headline caveat).** Like a finished ADR, a
  COMPLETE story (the library today — `storyUatCompleteness` reads it GREEN) has no genuine red for
  gate-as-proof to drive: a live story-node build observes the spec already-complete at CONFIRM_RED and
  fails closed (no real red was observed first). So this ADR ships the `--real` **affordance** + the
  dry-run glue + the mechanism — a live red→green needs a story authored from an INCOMPLETE/scaffold
  state. The library caps' brownfield arms are likewise affordance arms (a live cap red needs a genuine
  regression). The owner's live `story build library --real` of the mature library is a human-witness
  action; this is surfaced, never pretended. (Whether a complete-at-CONFIRM_RED story should instead
  observe-and-sign as `adopted` (ADR-0085) is the alternative the owner already weighed and declined in
  favour of gate-as-proof; re-open it there if the mature-story live path is wanted.) *([ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
  LATER re-opened exactly this and chose the library's green path = **Adopt** / `## Reliability Gates`
  (ADR-0085), per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*
- **The registry is now a pure parity/fallback oracle.** With the library caps moved spec-borne, NO
  corpus node resolves `source: "registry"` any more — the registry's fallback role is exercised only by
  the resolver unit tests (synthetic specs). The 7 migrated `real:` twins stay as the parity oracle.
- **Per-story completeness-test accumulation** (one frozen completeness test per gate-as-proof story
  build) — inert, not rotting, like ADR-0059's per-ADR tests; pruning post-verdict is an open owner call.
- **The amendment widens a structural honesty bound.** Permitting `stories/` and `docs/` roots is a
  deliberate relaxation of ADR-0087's "one concrete package/app" rule for authoring nodes; it stays
  bounded to one concrete doc dir, but it is a wider trust surface than code-only scopes.

## References

- [ADR-0059](0059-gate-as-proof-authoring-nodes-earn-a-signed-verdict-via-thei.md) — gate-as-proof for ADR authoring; §4 named story-authoring as the next kind (this ADR amends it).
- [ADR-0087](0087-spec-borne-write-scope-is-bounded-structurally-not-by-pr-dif.md) — the spec-borne write-scope structural bound (this ADR amends it to add authoring-doc roots).
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — node-borne proof config (keystone A), expansion D (`story build --real`), expansion E (gate-as-proof).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — `uat_witness`: a machine-witnessed story drives its own UAT node.
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) / [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — the story-green crown (per-test UAT + caps-green) the node verdict must NOT be conflated with.
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) / [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the studio's story-level Build this unblocks.
- `stories/drive-machinery/story-real-chain.md` — named this exact gap; `stories/drive-machinery/gate-as-proof-authoring.md` — the ADR-kind precedent.
- `packages/cli/src/story-completeness.ts` (+ `.test.ts`), `packages/cli/src/gate-as-proof-story.test.ts`, `packages/orchestrator/src/proof-config.ts` (`scopeGlobBoundIssue`), `stories/library/*.md` (the spec arms).
