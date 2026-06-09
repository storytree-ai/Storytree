# Bringing the V1 agent roster into the v2 Library

**Status:** proposal / research (2026-06-10). PROPOSAL ONLY — nothing in this doc has mutated
`packages/core/knowledge.ts`, `packages/store`, `apps/studio/data/knowledge.json`, or the live DB.
The candidate artifacts are drafted under `docs/research/agent-artifacts-draft.json` (a proposal
file, explicitly **not** `knowledge.json` and **not** loaded into the store). The category design is
in **ADR-0029** (`docs/decisions/0029-agents-as-library-artifact-category.md`, Status: proposed).

Related prior art: `docs/research/agentic-foundation-survey.md` (the conceptual port of V1's
foundation into v2 — owned loop + TDD discipline). This doc is the roster-specific companion: where
that survey asked "what foundation carries", this asks "what of the ten V1 *agents* carries, and in
what shape".

## Motivation — the V1 roster is the system's durable methodology

V1 ("Agentic", vendored read-only at `legacy/Agentic/`) encoded its operating discipline as a
**roster of ten authored agents** under `legacy/Agentic/agents/` — each a three-file YAML spec
(`contract.yml` = scope + outcome; `inputs.yml` = required_reading + context + tools;
`process.yml` = workflow + guidance). That roster is not incidental scaffolding; it is the *durable
methodology* of the system: the red-before-green honesty discipline, the read-only-verification
posture, the scoping/splitting rules for sizing work, the friction-to-guidance graduation loop, the
"an agent can never self-attest" signing chain. Those rules were learned the hard way (see the
specific lesson references the drafts carry — `f53caac`, story 22's hollow-implementation cascade,
the 2026-05-06 source-fix adjudication) and they remain correct under v2.

What changed is the *substrate*, not the methodology. The five reversals (CLAUDE.md) move ground
truth from on-disk YAML to a live Cloud SQL Library (ADR-0017/0019/0023), collapse the per-node
runtime to one owned loop (ADR-0011), turn routing into deterministic spine code (ADR-0004/0005),
build the red-green gate spine-side (ADR-0020), and hand the outer loop to a human in the studio
(ADR-0008). Under those reversals much of the roster's *work* became code or human judgment — but
its *discipline* is exactly what v2's leaves, gate, and curators need as their behavioural floor.

The proposal: capture that durable methodology where v2 keeps durable cross-cutting knowledge — the
**Library** — as a new `agent` artifact category, so an agent's role + operating discipline is a
queryable, schema-validated, provenance-carrying unit rather than prose lost in a legacy submodule.
This makes the V1→v2 reasoning auditable (every carry/evolve/merge/obsolete decision has a recorded
rationale and a `provenance` pointer back to the V1 source) and gives v2's agent-context surface
(`storytree agents <name>`, ADR-0023 §7) a real corpus to draw from.

## The V1 → v2 mapping

Ten V1 agents collapse into a small set of code surfaces, two spine-side gate phases, one unified
Library curator, and two read-only methodologies. Disposition counts: **carry 0 · evolve 6 ·
merge 1 · obsolete 3** (`guidance-writer` is the merge; it folds into `library-curator`).

| V1 agent | Disposition | v2 name / surface | Rationale (short) |
|---|---|---|---|
| `session-orchestrator` | **obsolete** | the deterministic **spine** (`packages/orchestrator`) + studio outer-loop | Routing/fan-out/composition becomes code: "if a for-loop or match could express the routing, the spine owns it" (ADR-0004/0005). ADR-0020 explicitly leaves its ~3,800 lines of git/worktree/merge ceremony behind. Nothing model-shaped remains; the routing *became* the code spine. Its orient-before-acting / parallel-fanout / route-to-the-owner discipline survives as **methodology**, not an agent. |
| `system-investigator` | **evolve** | `library-investigator` | A read-only, single-claim verification subagent, re-pointed from V1's on-disk YAML corpus to v2's live Cloud SQL Library + ADRs + glossary + event store. Its read-only floor, one-question-per-invocation, structured return, and authoritative-source-beats-derived precedence carry almost verbatim; only the source map changes. *More* load-bearing in v2: state lives in a concurrently-mutated shared DB (ADR-0009/0023), so a stale brief is the default hazard. |
| `escalation-screener` | **obsolete** | studio outer-loop (ADR-0008) + curation guidance | Its gate (what deserves human attention) is absorbed by the human-held outer loop + the spine's pre-filtering. With `session-orchestrator` obsolete and "no persona cascade" (ADR-0004), the screener has no principal to be Chief-of-Staff to. Its seven checks survive as authoring guidance for how the spine/studio surface decisions, not as an agent. |
| `story-writer` | **evolve** | `library-curator` | The largest carrier of V1 authoring wisdom: journey-principle, splitting-rule, edit-first-search, consolidate-over-fragment, proof-walkthrough-as-sizing-test. Now writes zod-validated JSONB units to the live Library via the CLI (`artifact new/edit --pg`), re-tiered to story > capability > contract (ADR-0002/0010). Write substrate + tier vocabulary change → evolve, not carry. |
| `build-rust` | **evolve** | owned-loop **builder** (prove-it-gate IMPLEMENT phase) | The implementer leaf, retargeted Rust→TS and re-housed *inside* the spine's prove-it-gate as IMPLEMENT. No longer a separate authority-walled process — the spine time-slices its write-scope (source paths only in IMPLEMENT). Slow-growth / baseline-preservation / source-fix-not-bandaid / no-hollow-implementation discipline carries verbatim as the leaf floor + spine/lint guards (ADR-0011/0020). |
| `test-builder` | **evolve** | owned-loop **test author** (AUTHOR_TEST / CONFIRM_RED) | The red-state author, absorbed into AUTHOR_TEST (test-paths-only write scope); the spine-run TestExecutor observes the RED of the right kind during CONFIRM_RED — the model never records the verdict. Right-kind-red / depth-not-shape assertions / fixtures-mirror-production / no-suppression / preserve-existing carry as the authoring floor (ADR-0020). |
| `test-uat` | **evolve** | **prove-it-gate** (CONFIRM_GREEN + GATE) | The verdict hand, absorbed into CONFIRM_GREEN observation + the signing GATE (built: `prove-it-gate.ts`). The spine observes GREEN-no-regression; GATE signs against commit-SHA + clean tree, attributes to a resolved signer, appends a non-authorable signing event. Partial-Pass-is-Fail / clean-tree-at-signing / an-agent-can-never-self-attest carry as gate invariants. UAT re-tiers to the STORY (ADR-0010). |
| `trace-explorer` | **evolve** | `friction-analyst` | Analysis-only friction reporter, re-pointed from per-run `trace.ndjson` to the event store (ADR-0006/0011) and feeding the notice-board → Library graduation loop (ADR-0014). Friction taxonomy / evidence-based / analysis-only-never-fix / story-first-fence carry; substrate + downstream consumer change. |
| `brief-writer` | **obsolete** | the **studio** (ADR-0008) | Its job — render decision state visually so the human can adjudicate a tradeoff — *is* the live studio. The one-off static-HTML brief is superseded by a durable, interactive DAG-rendering surface. With no orchestrator-agent to spawn it, the static-HTML agent is structurally redundant; its analogy-first / name-both-sides / end-with-the-question framing carries as surfacing guidance. |
| `guidance-writer` | **merge** → `library-curator` | `library-curator` (+ the `storytree agents <name>` namespace) | Two V1 curators (specs+assets vs stories+patterns) over corpora that v2 unifies into one Library tier reached by one CLI (ADR-0017/0019/0023). Its edit-first / 2+-consumer-extraction / reference-don't-restate / minimal-tool-grants discipline carries; the three per-agent YAML files, `assets/`, and `.claude/hooks` wiring are dropped. Merges rather than persists as a second agent. |
| `memory-curator` | **evolve** | the **notice-board curation step** (ADR-0014) | Graduate-durable-rules-out-of-ephemeral-memory becomes ADR-0014's notice-board → Library graduation: the spine PROPOSES on a cite-threshold; the human APPROVES as a signed `actor=operator` event. Its stateless-vs-stateful discriminator + preservation-bias carry as the proposing heuristic; the V1 autonomous-direct-lift authority is REVOKED in favour of the operator-approval gate. |

> **Supersession note (2026-06-10, post-merge):** ADR-0014 has since been **superseded by
> ADR-0017/0018** — see [ADR-0027](../decisions/0027-supersede-adr-0014-notice-board.md). The two
> rows above that cite it survive intact: ADR-0027 confirms the cite-threshold curation policy
> ("spine proposes, operator approves") as *decided-but-unbuilt*, carried forward as the
> `oq-feedback-graduation-mechanism` open-question in the Library. Read "ADR-0014" in this table as
> "the graduation intent now owned by ADR-0017, tracked by `oq-feedback-graduation-mechanism`".

### How the roster nets out

- A deterministic **spine** absorbs `session-orchestrator`'s routing.
- One **owned loop**, acting through the prove-it-gate phases, absorbs `test-builder` /
  `build-rust` / `test-uat` as AUTHOR_TEST / CONFIRM_RED / IMPLEMENT / CONFIRM_GREEN / GATE.
- Two read-only methodologies: `library-investigator` (verification) and `friction-analyst`
  (feedback).
- One unified `library-curator` (`story-writer` + `guidance-writer`) authoring the Library.
- The human-held **studio outer-loop** absorbs `escalation-screener`'s gating, `brief-writer`'s
  visualization, and `memory-curator`'s graduation approval.

## Category design — see ADR-0029

ADR-0029 (`docs/decisions/0029-agents-as-library-artifact-category.md`, Status: proposed) is the
authoritative design for the new `agent` kind. In brief, the kind carries these structured fields in
`KIND_SPECS.agent` render order (lead first, then `## ` sections):

```
oneLine         (lead, required)   — **The agent.**
role            (required)         — ## Role
owns            (required)         — ## Owns
doesNotTouch    (optional)         — ## Does not touch
authority       (required)         — ## Authority
outcome         (required)         — ## Outcome
requiredReading (required)         — ## Required reading
tools           (required)         — ## Tools
workflow        (required)         — ## Workflow
rules           (optional)         — ## Rules
antiPatterns    (optional)         — ## Anti-patterns
escalation      (optional)         — ## Escalation
```

The V1-source pointer and the v2-surface pointer are **not** new body fields — they ride the
existing `commonShape` `references` (`doc:`/`asset:` pointers) and `provenance` (attribution prose),
consistent with every other kind. The zod object inherits `commonShape` (`id`, `title`,
`description`, `schemaVersion`, `references`, `provenance`, glossary-projection metadata,
`createdAt`, `updatedAt`) and `kind: z.literal("agent")` via `buildKindSchema`. Gloss string:
*"a role and its operating discipline"*.

V1 five-bucket → v2 field fold-down: `scope.purpose` → `oneLine`+`role`;
`scope.owns`+`outcome.outputs` → `owns`; `scope.does_not_touch` → `doesNotTouch`;
`scope.authority` → `authority`; `outcome.success_criteria` → `outcome`;
`inputs.required_reading`+`context` → `requiredReading`; `inputs.tools`+`commands` → `tools`;
`process.workflow` → `workflow`; `process.guidance.{rules,anti_patterns,escalation}` →
`rules`/`antiPatterns`/`escalation`. Dropped: `inputs.parameters` (per-invocation runtime concern)
and V1's directory `category` bucket.

## Candidate artifacts

Drafted in `docs/research/agent-artifacts-draft.json` (a JSON array; proposal-only). Eight units, one
per surviving/recorded role:

1. `library-investigator` (evolve ← `system-investigator`) — read-only single-claim verifier over the
   live Library + ADRs + event store.
2. `library-curator` (evolve ← `story-writer`, **merged** with `guidance-writer`) — authors
   work-hierarchy + reusable-guidance units to the live Library via the CLI; authors agent boot
   baselines in the `storytree agents <name>` namespace. *(Two draft entries in the JSON express the
   two halves of the merged role — the work-hierarchy/pattern-curation half and the agent-spec/
   guidance-layer half; the owner should decide whether they land as one unit or two, see open call 5
   below.)*
3. `agent-owned-loop-builder` (evolve ← `build-rust`) — the IMPLEMENT-phase implementer leaf.
4. `agent-owned-loop-test-author` (evolve ← `test-builder`) — the AUTHOR_TEST / CONFIRM_RED red-state
   author.
5. `agent-prove-it-gate-verdict` (evolve ← `test-uat`) — the CONFIRM_GREEN + GATE verdict hand.
6. `friction-analyst` (evolve ← `trace-explorer`) — analysis-only friction reporter feeding the
   notice-board → Library loop.
7. `agent-notice-board-curation-step` (evolve ← `memory-curator`) — the spine-proposes /
   human-approves graduation step.

The three **obsolete-as-agent** V1 roles (`session-orchestrator`, `escalation-screener`,
`brief-writer`) are *not* drafted as live `agent` units in the array; whether they should be recorded
as retired-provenance units is open call 4 below.

## Open modeling calls for the owner

These need an owner decision before any of this moves from proposal to the live Library. The first is
the gating one.

1. **Ratify the `agent` category + apply the schema migration.** This proposal adds a new `kind` to
   `KIND_SPECS` / the zod schema in `packages/core/knowledge.ts` and therefore needs a schema
   migration governed by ADR-0026 (per-row `schemaVersion`, forward-only migrate-on-write). Nothing
   here touches the schema or DB yet — ratifying the category and authorizing the migration is the
   precondition for everything else.

2. **Do agents belong IN the Library, or in a separate tier?** This proposal places them in the
   Library (cross-cutting, queryable, provenance-carrying, one CLI). An alternative is a distinct
   agent tier. Related: keep the `agent` *kind* distinct from the `storytree agents <name>` *context-
   assembly namespace* (ADR-0023 §7), or bind them so context-assembly reads the unit directly?
   (ADR-0011 territory.)

3. **Final authority boundaries per agent.** Each draft pins an `authority` / `doesNotTouch` /
   `escalation` boundary (e.g. the investigator's read-only floor, the builder's source-only write
   scope, the gate's never-self-attest). The owner should ratify each boundary, especially where it
   re-points a V1 authority (the curator's narrow shared ADR authority; the curation step's revoked
   autonomous-lift carve-out).

4. **Record obsolete V1 agents as retired-provenance units?** Should `session-orchestrator`,
   `escalation-screener`, and `brief-writer` be recorded as `agent` units (uniform, queryable, with
   `provenance` documenting the obsoletion) — making all eleven roster decisions auditable in one
   place — or folded into ADR prose only (since an obsolete agent is closer to history than a live
   role)? (Draft leans toward recording all, for auditability; the draft array currently omits them
   pending this call.)

5. **`library-curator`: one unit or two?** The `story-writer` evolution and the merged
   `guidance-writer` half are drafted as two entries sharing the `library-curator` id. The owner
   should decide whether the merged role lands as a single consolidated unit or two cohabiting units,
   and confirm the required/optional field floor (the draft keeps `rules`/`antiPatterns`/`escalation`/
   `doesNotTouch` optional and the rest required; in particular whether `outcome` should be required
   for an *obsolete* agent if call 4 records them).

6. **Drift-guard scope.** Is the `KIND_SPECS` ↔ zod parity test sufficient, or should an
   `agent`-`references`-resolve check be added (WARN → GATE per ADR-0026 §6)? Whether v2 agent names
   should become glossary terms or stay Library-only is a smaller sub-call (leaning Library-only).
