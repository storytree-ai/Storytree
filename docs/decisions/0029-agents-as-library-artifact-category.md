---
status: accepted
decided: 2026-06-11
---

# ADR-0029: The agent roster is a Library artifact category (`agent` kind)

## Status

accepted (2026-06-11) — proposed 2026-06-10; ratified with the owner decisions recorded in
§"Open questions for the owner" below. Adds a new `kind` to the Library
([ADR-0017](0017-cross-cutting-knowledge-tier.md) /
[ADR-0019](0019-library-tier-name-and-defer-dbos.md)) under the schema-driven `KIND_SPECS`
contract ([ADR-0018](0018-knowledge-tier-phase1-structured-source.md)), reached by the same
choose-your-own-adventure CLI ([ADR-0023](0023-library-cli-choose-your-own-adventure.md)) and
governed by the same migration posture ([ADR-0026](0026-library-schema-migrations-and-health-checks.md)).
Records the V1 (`legacy/Agentic`) agent roster as durable, citable Library units rather than letting
the roster mapping live only in branch memory. **Built and seeded at ratification:** `KIND_SPECS.agent`
+ the studio taxonomy + the KIND_SPECS↔zod parity test landed, and the eleven roster units were
written to the live store via the library CLI (and to the `knowledge.json` seed). Note: this ADR was
drafted when `agent` would have been the *seventh* kind; ADR-0034's `process` landed first, so
`agent` is the **eighth** — the design is unchanged. The seed content carries the
[ADR-0032](0032-cite-graduation-mechanism.md) retrofit: the cite-threshold curation step is recast as
the deferred **signal-synthesis** agent (see the roster-mapping note below).

**Reshaped 2026-06-11** (same day, post-ratification owner steer): the field table in Decision §2,
the template in §3, the §"V1 bucket → v2 field" fold-down, and the "additive — no row upcast"
migration posture are **superseded by §"Owner reshape (2026-06-11)"** below — the kind now carries
six prose fields + three typed `asset:` ref-lists (schemaVersion 2, migration
`agent-context-assembly-reshape`), and the library holds the eight live-role units only (the three
obsolete-as-agent units were removed; their dispositions are recorded in the reshape section).

## Date

2026-06-10

## Context

The V1 system shipped a roster of **ten authored agents** under `legacy/Agentic/agents/`, each a
three-file YAML spec: `contract.yml` (scope: name/category/purpose/owns/does_not_touch/authority +
outcome: outputs/success_criteria), `inputs.yml` (required_reading/context/parameters/tools/commands),
and `process.yml` (workflow + guidance.rules/anti_patterns/escalation). That roster is the single
densest carrier of V1's hard-won operating discipline — the red-green honesty property, the
authority walls, the orient-before-acting and source-fix-not-bandaid rules.

Under the v2 reversals most of that roster does **not** carry as *runtime* agents:

- **pi is gone; we own one loop** ([ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)).
  V1's per-crate authority walls collapse into a single owned loop.
- **Routing is deterministic code** ([ADR-0004](0004-orchestrator-agent-boundary.md) /
  [ADR-0005](0005-orchestration-spine-code-vs-judgment.md)): "if a for-loop or match could express
  the routing, the spine owns it." The session-orchestrator agent becomes `packages/orchestrator`.
- **The prove-it-gate is built spine-side** ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)):
  the test/build/uat trio re-expresses as the AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN →
  GATE phases of one time-sliced loop.
- **The human holds the outer loop in the studio** ([ADR-0008](0008-ui-drives-agents-approvals.md)):
  the screener's gating, the brief-writer's visualisation, and the memory-curator's promotion
  approval are absorbed by human judgment + the live IDE.
- **The library/knowledge tier is the durable home** ([ADR-0017](0017-cross-cutting-knowledge-tier.md) /
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md)): the teacher tier (story-writer +
  guidance-writer) converges on one `library-curator`; trace-explorer and memory-curator feed the
  notice-board → library graduation loop ([ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)).

So a verbatim port of `agents/**/{contract,inputs,process}.yml` would be wrong — it would re-import a
roster the architecture has dissolved. But two things are nonetheless true and currently
**un-recorded in any durable, citable place**:

1. **The roster mapping itself is load-bearing knowledge.** "session-orchestrator is obsolete-as-an-
   agent because its routing became `packages/orchestrator`" / "build-rust evolves into the IMPLEMENT
   phase" is exactly the kind of cross-cutting, ADR-rooted derivation the Library exists to hold
   (ADR-0017 §3). It currently lives only in a branch memory blob.
2. **v2 will grow its own agents.** ADR-0023 already reserves the `storytree agents <name>` namespace
   (§7) and gives the agent that sets up a new agent the *liberty* to curate up-front injection (§9).
   Those agent specs need a typed, zod-validated, citable home — not a return of the three-YAML-file
   shape (the glossary drops V1's `contract/inputs/process.yml` split), and not a free-text body that
   can drift. The Library's `kind`-discriminated, `KIND_SPECS`-driven schema is the right substrate.

The Library schema is *exactly* the place: a `kind` is an ordered field table in `KIND_SPECS`
(`packages/core/src/knowledge.ts`) that drives three derived artifacts that can never drift — the zod
discriminated union, `renderBody`, and `generateTemplate` (ADR-0018 §2). Adding a roster category is
therefore "add one `KIND_SPECS` entry + its studio taxonomy row + a drift-guard test," not a bespoke
data model.

## Decision

1. **Add a new Library `kind`: `agent`** (drafted as the seventh; landed as the eighth after
   ADR-0034's `process`). It joins
   `definition | principle | pattern | guardrail | techstack | process | open-question` as a first-class,
   zod-validated, CLI-reachable artifact category. An `agent` unit captures **what a v2 agent (or an
   obsolete-V1-agent disposition) is**: its role, the surface it owns, its authority floor, the proof
   it must produce, the context it reads, and its operating discipline — folded down from V1's five
   buckets into one knowledge unit, with explicit provenance to the V1 source and a pointer to the v2
   surface that carries it.

2. **The structured field table (`KIND_SPECS.agent`), in render order.** *(SUPERSEDED — see
   §"Owner reshape (2026-06-11)" for the live table; kept for the V1 fold-down record.)* One lead
   field plus eleven `## ` section fields. Mapping from V1's five buckets is given in
   §"V1 bucket → v2 field" below.

   | # | field | lead | heading | required | maps from (V1) |
   |---|-------|------|---------|----------|----------------|
   | 1 | `oneLine` | yes | `**The agent.**` | yes | scope.purpose (one sentence) |
   | 2 | `role` | no | `Role` | yes | scope.purpose (full) |
   | 3 | `owns` | no | `Owns` | yes | scope.owns + outcome.outputs |
   | 4 | `doesNotTouch` | no | `Does not touch` | no | scope.does_not_touch |
   | 5 | `authority` | no | `Authority` | yes | scope.authority |
   | 6 | `outcome` | no | `Outcome` | yes | outcome.success_criteria |
   | 7 | `requiredReading` | no | `Required reading` | yes | inputs.required_reading + inputs.context |
   | 8 | `tools` | no | `Tools` | yes | inputs.tools + inputs.commands |
   | 9 | `workflow` | no | `Workflow` | yes | process.workflow |
   | 10 | `rules` | no | `Rules` | no | process.guidance.rules |
   | 11 | `antiPatterns` | no | `Anti-patterns` | no | process.guidance.anti_patterns |
   | 12 | `escalation` | no | `Escalation` | no | process.guidance.escalation |

   The V1 source pointer (`agents/<category>/<name>/`) and the v2-surface pointer (the code package or
   human surface the agent's work now lives in) are carried by the **common** `references` +
   `provenance` fields, not new body fields — consistent with how every other kind cites its source
   (ADR-0018; `docs/research/library-sources-unification.md`). `references` holds
   `doc:decisions/<adr>.md` + `asset:<id>` pointers (e.g. the ADR that obsoleted or re-housed the
   agent, the v2 `pattern`/`guardrail` units that carry its surviving discipline); `provenance` holds
   the prose a bare pointer can't — "Imported from V1 `legacy/Agentic/agents/build/build-rust/`;
   obsolete-as-agent, role survives as the prove-it-gate IMPLEMENT phase."

3. **The `KIND_SPECS.agent` entry (gloss + render template scaffold).** The kind's one-line gloss is
   **"a role and its operating discipline"**. The blank template (`generateTemplate('agent')`, derived
   byte-for-byte from the placeholders below) is:

   ```markdown
   **The agent.** _The role in one sentence — who it is and the single job it owns._

   ## Role

   _The full purpose: what this agent is for, what it produces, and the boundary of its job._

   ## Owns

   _The surface it is the authority for — the paths / phases / artifacts it may write, and the outputs it produces._

   ## Does not touch

   _The surfaces explicitly outside its authority — what another owner holds. Omit if the agent owns everything in its scope._

   ## Authority

   _The specific writes and promotions it may and may not make — the floor that makes its work falsifiable (e.g. "may flip status proposed→under_construction; may never sign a verdict")._

   ## Outcome

   _The success criteria: the observable, falsifiable condition that means this agent's work is done and correct._

   ## Required reading

   _The context it must load before acting — the ADRs, glossary terms, Library units, and live state it reads just-in-time (ADR-0011/0023)._

   ## Tools

   _The tool surface and canonical commands it is granted — kept minimal (least-authority), each named with why it is needed._

   ## Workflow

   _The arc it runs: session-start orientation, the ordered steps, and the stop condition._

   ## Rules

   _The operating discipline — the judgement rules that carry as this agent's behavioural floor. Cite the Library principle/guardrail each rule graduates into rather than restating it. Omit if none._

   ## Anti-patterns

   _The named failure modes it must refuse, each with the lesson that taught it. Omit if none._

   ## Escalation

   _What it surfaces rather than deciding — the boundary where it stops and routes to the human outer loop or the owning surface. Omit if it never escalates._
   ```

   `oneLine` is the lead (renders inline as `**The agent.** …`); the rest render as `## ` sections via
   `renderBody`, exactly like every other kind. No renderer or template-generator change is needed —
   both are already fully driven by `KIND_SPECS` (ADR-0018 §2), so adding the table entry is sufficient.

4. **The zod schema follows mechanically.** `buildKindSchema("agent")` produces the per-kind object
   (required fields → `Markdown`, optional → `Markdown.optional()`, `kind: z.literal("agent")`,
   `.strict()`), and `agent` is added to the `KnowledgeKind` union and the `Knowledge` discriminated
   union. No change to `commonShape` (it already carries `schemaVersion`, `references`, `provenance`,
   and the glossary-projection metadata every kind may use).

5. **The studio taxonomy gains one row.** `AssetCategory` adds `'agent'`; `ASSET_CATEGORIES` appends
   `'agent'`; `ASSET_CATEGORY_GLOSS.agent = 'a role and its operating discipline'`. (`apps/studio/src/types.ts`.)
   The studio Library grid renders the new category like any other; no UI logic change beyond the
   taxonomy data. Note the studio union also carries the non-knowledge categories `template` and `adr`
   — `agent` sits beside `definition`…`open-question` as a *knowledge* kind, so it must land in **both**
   `knowledge.ts` (the zod union) and `types.ts` (the studio union), unlike `template`/`adr` which live
   only in the studio union.

6. **Reach it through the existing CLI; no new command.** `storytree library artifact list agent`
   lists the roster; `storytree library artifact <id>` prints one; `storytree library artifact new
   --file <doc.json> --pg` / `edit … --pg` author them (ADR-0023 §10 fast-iteration write mode). The
   `storytree agents <name>` namespace (ADR-0023 §7) — context/system-prompt assembly — is a **distinct
   surface** and is *not* what this ADR adds: the `agent` *kind* is the Library's record of a role; the
   `agents` *namespace* is how a running agent assembles its own context. A later build may have
   `storytree agents <name>` read its role's `agent` unit as one input, but that binding is ADR-0011
   territory and out of scope here.

7. **Design rule: reference, don't restate — the agent body is an index, not a copy of the doctrine.**
   An `agent` unit's durable operating discipline lives as **Library artifacts** (`principle` /
   `guardrail` / `pattern` units), referenced by typed `asset:` / `doc:` pointers in the unit's
   `requiredReading` and `references`. The artifact body is kept **lean**: the role, the authority
   boundary, the workflow *shape*, and POINTERS — never restated rule prose. A `rules` /
   `antiPatterns` entry is a name plus at most a one-line gloss plus the citation; the mechanics,
   the why, and the lesson live in the cited unit. Role-*specific* shape (an output contract, a
   fixed taxonomy, a phase boundary) stays in the body — the rule governs *shared doctrine*, the
   content two or more bodies could otherwise duplicate.

   This is not a new idea; it is the **v2 form of V1's `inputs.yml required_reading` + `assets/`
   mechanism**, and the lineage did not drift on the way here. V1 kept durable content once under
   `assets/` and had agent specs point at it: `legacy/Agentic/agents/planner/story-writer/inputs.yml`
   `required_reading` entries literally say "See assets/definitions/story-schema-contract.yml",
   "Reference rather than re-paraphrase in story prose", "Cited in process.yml guidance.rules as the
   edit-default rule" — and `legacy/Agentic/agents/README.md` lists "reference don't restate" among
   its ten non-negotiable principles, with CLAUDE.md kept as a thin pointer so "a single edit
   propagates rather than drifting across copies". In v2 the DRY layer IS the Library
   (ADR-0017/0019/0023), and ADR-0011 owns the delivery mechanism: the context engine injects the
   referenced unit's content **just-in-time, per step** — guidance is pulled from Library artifacts
   at the moment it governs an action, not baked into the spec that names the role. One edit to the
   Library unit propagates to every agent that cites it; a restated copy would drift exactly the way
   "reference don't restate" exists to stop.

   Mechanically: where a needed unit does not exist yet, the agent draft cites a **candidate** unit
   (drafted in the Library's structured shape; see `docs/research/agent-guidance-candidates.json`)
   and marks it `(candidate)` until the owner ratifies it. The blank template's `Rules` placeholder
   (§3 above) already states the per-field form of this rule; this section makes it a kind-level
   design invariant rather than a template hint.

8. **Obsolete-as-agent dispositions are recorded too, not silently dropped.** The roster mapping (cited
   below) marks five V1 agents `obsolete` and six `evolve`/`merge`. Both are recorded as `agent` units:
   an obsolete one carries its disposition in `oneLine`/`role` ("Obsolete as a v2 agent; its routing
   body became `packages/orchestrator`") and points `provenance`/`references` at the ADR that absorbed
   it and the v2 surface that carries its residual discipline. This makes the *dissolution* itself
   queryable knowledge — the whole point of recording the mapping in the Library rather than a memory
   blob.

## V1 bucket → v2 field (the fold-down)

V1's three files / five buckets collapse to one unit so the role reads top-to-bottom:

- **scope** (`contract.yml`): `purpose` → `oneLine` (one sentence) + `role` (full); `owns` → `owns`;
  `does_not_touch` → `doesNotTouch`; `authority` → `authority`.
- **outcome** (`contract.yml`): `outputs` → folded into `owns` (what it produces *is* what it owns);
  `success_criteria` → `outcome`.
- **inputs** (`inputs.yml`): `required_reading` + `context` → `requiredReading`; `tools` + `commands`
  → `tools`; `parameters` → dropped (V1's per-invocation `story_id`-style params are a runtime concern
  of the owned loop, not durable role knowledge).
- **process** (`process.yml`): `workflow` (session_start + steps + stop) → `workflow`;
  `guidance.rules` → `rules`; `guidance.anti_patterns` → `antiPatterns`; `guidance.escalation` →
  `escalation`.

The deliberate omission is V1's runtime-`category` directory bucket (`build` / `test` / `orchestration`
/ `planner` / `teacher`) and per-invocation `parameters`: neither is durable role knowledge, and the v2
disposition (the v2-surface pointer in `provenance`) supersedes the V1 directory taxonomy.

## The V1 roster mapping (the seed content)

Eleven `agent` units, one per V1 roster entry, with v2 disposition:

| V1 name | disposition | v2 name / surface |
|---------|-------------|-------------------|
| session-orchestrator | obsolete | the deterministic spine (`packages/orchestrator`) + studio outer-loop |
| system-investigator | evolve | `library-investigator` (read-only, over the live Cloud SQL Library + event store) |
| escalation-screener | obsolete | studio outer-loop (human-held approval/steering) |
| story-writer | evolve | `library-curator` (work-hierarchy + pattern units via the `storytree library` CLI) |
| build-rust | evolve | owned-loop builder = prove-it-gate IMPLEMENT phase (Rust→TS) |
| test-builder | evolve | owned-loop test author = AUTHOR_TEST + executor-owned CONFIRM_RED |
| test-uat | evolve | prove-it-gate CONFIRM_GREEN + the signing GATE phase |
| trace-explorer | evolve | `friction-analyst` (read-only over the event store, feeding the signal → Library graduation loop) |
| brief-writer | obsolete | the studio (the live web IDE supersedes the static HTML brief) |
| guidance-writer | evolve → merge | `library-curator` (merged with story-writer; `storytree agents <name>` namespace) |
| memory-curator | evolve | `agent-signal-synthesis` — the deferred signal-synthesis agent (ADR-0032) |

The full per-entry rationale (why obsolete vs evolve, what discipline carries, which ADR absorbs each
surface) is the body of each unit; it is supplied to the drafting/authoring phase as the roster JSON in
the task brief, not re-typed here.

> **ADR-0032 retrofit (2026-06-11, applied at seeding).** The memory-curator row was drafted as "the
> notice-board curation step (spine proposes on a cite-threshold, human approves graduation)" —
> [ADR-0032](0032-cite-graduation-mechanism.md) superseded that mechanism before this ADR ratified:
> a cite is a typed **link** (building a signal-graph), graduation is a (future) **synthesis agent**
> emitting OQs/proposals into the ADR-0018 OQ→ADR flow, and the cite-stuffing/anti-gaming defences
> are deliberately not built. The seeded unit is therefore `agent-signal-synthesis` (deferred —
> named, unbuilt; `stories/feedback-graduation/` is the build vehicle), and `friction-analyst`'s
> downstream pointer was re-pointed the same way. The seeded ids, for the record:
> `library-investigator`, `library-curator`, `library-curator-agent-spec-half` (story-writer and
> guidance-writer landed as two units — the merge stays an open owner call recorded in the units),
> `agent-owned-loop-builder`, `agent-owned-loop-test-author`, `agent-prove-it-gate-verdict`,
> `friction-analyst`, `agent-signal-synthesis`, `session-orchestrator`, `escalation-screener`,
> `brief-writer`.

## Migration posture (per ADR-0026)

**Adding the `agent` kind is ADDITIVE and needs no row upcast.** Precisely:

- **No existing row changes shape.** The `agent` kind introduces a *new* discriminant value; every
  stored `definition`/`principle`/… row is untouched. `.strict()` rejects unknown fields *per kind*, and
  no existing kind gains or loses a field. So there is **no `MIGRATIONS` entry and no
  `CURRENT_SCHEMA_VERSION` bump** required to add the kind — the registry exists to migrate *data that
  changed shape* (ADR-0026 §2), and nothing here did. New `agent` rows are authored directly at the
  current `CURRENT_SCHEMA_VERSION` via the write-boundary upcast (ADR-0026 §3); they are *born* at the
  current version, not migrated up to it.

- **What does change (the code, not the data):** (a) the **zod discriminated union** gains `Agent` and a
  `KnowledgeKind` arm; (b) **`KIND_SPECS`** gains the `agent` table — which by construction also updates
  `renderBody` and `generateTemplate` (one table, three consumers; ADR-0018 §2); (c) the **studio
  taxonomy** (`AssetCategory` / `ASSET_CATEGORIES` / `ASSET_CATEGORY_GLOSS`); (d) any **drift-guard
  contract** that enumerates the kinds — the `KIND_SPECS`↔schema parity test and the CLI/studio category
  lists must include `agent`, or they fail closed (the desired behaviour: a half-added kind is a red
  test). These are *schema-surface* changes (new code under the prove-it-gate), distinct from a *data*
  migration (a `MIGRATIONS.up()` transform), and ADR-0026's GATE checks classify them correctly:
  **schema-conformance** stays green (existing rows still validate); **version-floor** stays green (no
  version bump, no laggards); **retired-field** is inapplicable (no field removed). The only way this
  change can redden a gate is the *intended* one — a parity/enumeration test that hasn't been taught the
  new kind.

- **Forward-only still holds.** If a later change *removes or renames* an `agent` field, *that* is a
  data migration (a `MIGRATIONS` entry + `CURRENT_SCHEMA_VERSION` bump + the eager batch-migrate of
  ADR-0026 §7) — but adding the kind, and adding new optional fields to it later, is not.

## Consequences

- The V1 roster mapping becomes **durable, citable, queryable Library knowledge** instead of a memory
  blob — `storytree library artifact list agent` answers "what happened to the V1 roster?" and each
  obsolete/evolve disposition cites the ADR that justifies it.
- v2's **own** agents get a typed home the moment they exist: a new agent is `artifact new` of an
  `agent` unit, zod-validated, rendered consistently, citable from work units — no return of the
  three-YAML-file shape, no free-text drift.
- The Library's "one table, three consumers" property (ADR-0018 §2) means the build is small and
  drift-proof: add the `KIND_SPECS` row + the studio taxonomy row + teach the parity/enumeration tests,
  and the schema, renderer, and template generator follow for free.
- **Cost:** a seventh kind is more surface to keep parity on (every kind-enumerating test, the CLI
  `list <category>` switch, the studio grid). Mitigated because the parity is *test-enforced* — a
  forgotten enumeration is a red gate, not a silent gap.
- The `agent` kind deliberately overlaps with `pattern`/`guardrail`/`principle`: an agent's *Rules* and
  *Anti-patterns* often graduate into standalone `pattern`/`guardrail` units (e.g. build-rust's
  source-fix-not-bandaid → the existing `dogfood-fix-the-source` principle). Decision §7 makes the
  posture a design invariant: the `agent` unit's *Rules* field **cites** those units via typed refs
  rather than restating them — the agent unit is the role's index, not a copy of the doctrine. The
  candidate units the eight drafts need beyond the existing corpus are drafted in
  `docs/research/agent-guidance-candidates.json`, awaiting ratification alongside the kind itself.

## Open questions for the owner — RESOLVED (owner decisions, 2026-06-11)

1. **`agent` vs the `storytree agents <name>` namespace — keep them distinct, or bind them?**
   **DECIDED: BIND, with the Library unit as the SOURCE of context assembly, not a mirror.** A later
   build makes `storytree agents <name>` assemble its context *from* the role's `agent` unit — the
   unit's `requiredReading`/`rules` are the source of the assembly, never a human-readable copy that
   could drift. The binding is **not built now**; this records the direction. Prompt-assembly shape
   when built: **structured fields + a renderer** (the oq-library-doc-shape lesson — option C's
   fields-are-authoritative, render-is-derived), not a freeform template with placeholders.

2. **Glossary projection for agents?** **DECIDED: NO.** Agent names stay Library-only — they are
   roles, not vocabulary. No `glossarySection`/`glossaryTerm` is set on `agent` units (and the seeded
   eleven carry none).

3. **Should obsolete-as-agent units live in the `agent` kind at all?** **DECIDED: record all eleven**,
   including the obsolete-as-agent units (the ADR's lean, decision §8), with `outcome` stating
   "n/a — obsolete; superseded by <surface>". The dissolution itself is queryable knowledge.

4. **Drift-guard scope.** **DECIDED: the `KIND_SPECS`↔zod parity test lands now**
   (`packages/core/src/knowledge.test.ts` — kind-enumeration parity, exactly-one-lead, required/optional
   fail-closed, renderer↔template byte-parity, and the Q5 split pinned for `agent`). The
   referential-integrity check on `references` **starts as WARN** (the ADR-0026 §6 posture: a
   non-gating check), **graduating to GATE later** — once the candidate guidance units the eleven seeds
   cite (`docs/research/agent-guidance-candidates.json`, awaiting separate ratification) are landed
   and the references resolve clean. Until then the `--check` listing of dangling `(candidate)`
   `asset:` pointers on the agent units is **expected**, not a defect to "fix".

5. **Required vs optional split.** **DECIDED: keep the draft's split.**
   `rules`/`antiPatterns`/`escalation`/`doesNotTouch` optional, the rest required; `outcome` stays
   **required even for obsolete units**, stated as "n/a — obsolete; superseded by <surface>".
   *(Superseded by the reshape below: the split is now `rules`/`antiPatterns`/`escalation` optional,
   `oneLine`/`role`/`outcome`/`context`/`tools`/`workflow` required — and obsolete units no longer
   exist in the kind at all.)*

## Owner reshape (2026-06-11)

Ratified the same day the kind landed, the owner reshaped the design before any consumer bound to
it. The driving rationale: **the `agent` unit is the SOURCE of dynamically assembled agent
context.** A later build makes `storytree agents <name>` (the ADR-0023 §7 namespace) assemble a
role's system prompt *from* its Library unit — structured fields + a renderer (the
oq-library-doc-shape option-C lesson: fields are authoritative, render is derived), **never**
freeform prompt templates with placeholders. The binding build stays deferred until a role actually
runs through the namespace; this section fixes the shape it will consume. Every field is therefore
either **per-role prose** the renderer prints, or a **typed ref the renderer injects** — and
anything that is neither (prose describing an enforcement wall) is deleted from the kind.

The reshaped field table (schemaVersion **2**; supersedes Decision §2/§3):

| # | field | lead | heading | required | type |
|---|-------|------|---------|----------|------|
| 1 | `oneLine` | yes | `**The agent.**` | yes | prose |
| 2 | `role` | no | `Role` | yes | prose |
| 3 | `outcome` | no | `Outcome` | yes | prose |
| 4 | `context` | no | `Context` | yes | `asset:` ref-list (non-empty) |
| 5 | `tools` | no | `Tools` | yes | prose |
| 6 | `workflow` | no | `Workflow` | yes | prose |
| 7 | `rules` | no | `Rules` | no | `asset:` ref-list |
| 8 | `antiPatterns` | no | `Anti-patterns` | no | `asset:` ref-list |
| 9 | `escalation` | no | `Escalation` | no | prose |

The decisions, in order:

1. **`owns` / `doesNotTouch` / `authority` are DROPPED.** Scope and authority walls are enforced by
   **code** (the fail-closed `PreToolUse` hook on the SDK leaf, the spine's `WriteScopedToolExecutor`
   / `PathWriteScope`, the signer chain) and by **guardrail units** — they are never *described* in
   guidance prose, where a description can drift from the wall it claims to describe and an agent
   can be talked out of it. Output-contract prose those fields carried (e.g. the investigator's
   structured-return shape) moved into `outcome`; the rest is recoverable from the event log.
   Compiling enforcement walls *from* Library artifacts (so a guardrail unit generates the hook
   config rather than merely citing it) is future work under **oq-artifact-code-backing**.

2. **`requiredReading` → `context`, retyped as the assembly manifest.** A typed, non-empty list of
   `asset:` refs — exactly the units whose content the `storytree agents <name>` renderer injects
   into the role's system prompt. **ADR references are BANNED in `context`:** agents are told ADRs
   exist and get a **search tool** instead — `storytree library search <query> --kind <kind>`,
   federating over Library artifacts AND `docs/decisions/`, with ADR hits returned as `doc:` refs.
   That verb is the named **first consumer of ADR-0023 §6's deferred search**; it is recorded here,
   not built with the reshape. ADR pointers that used to sit in `requiredReading` live in the
   common `references` field (the Sources view), where they belong as citations rather than
   preloaded context.

3. **`rules` and `antiPatterns` retyped as `asset:` ref-lists** (the §7 cite-don't-restate rule made
   structural): each entry names a principle/pattern (`rules`) or guardrail/cautionary
   (`antiPatterns`) unit whose content the renderer injects. The three ref-lists are kept
   **disjoint** per unit — a cited unit is injected once, under one prompt section. Role-*specific*
   shape (output contracts, fixed taxonomies, phase boundaries) stays in the prose fields.
   Dangling refs to not-yet-ratified guidance units (`docs/research/agent-guidance-candidates.json`)
   remain acceptable under the Q4 WARN-level referential-integrity posture — the WARN→GATE
   graduation waits on the candidates' own ratification pass, unchanged.

4. **Live roles only.** The library holds CURRENT state; everything else must be recomputable from
   ADRs. The three obsolete-as-agent units (`session-orchestrator`, `escalation-screener`,
   `brief-writer`) were **removed** from the seed and the live store (Q3 is superseded), and their
   dispositions are recorded here so nothing is lost:
   - **session-orchestrator** — V1's routing/fan-out/session-composition principal (~3,800 lines of
     git/worktree/merge ceremony). Routing became deterministic spine code (ADR-0004/0005:
     `packages/orchestrator` — `runSequence`/`runLoop`, the phase machine; ADR-0020 explicitly
     leaves the merge ceremony behind), session-steering became the human-held studio outer loop
     (ADR-0008). What survives is methodology, not an agent: orient-before-acting, fan-out belongs
     to the caller (`asset:orchestrator-is-sole-fan-out`), route-to-the-owner.
   - **escalation-screener** — V1's Chief-of-Staff gate on what deserved human attention. With no
     principal to screen for (no persona cascade, ADR-0004), the human-held outer loop (ADR-0008)
     plus the spine's deterministic pre-filtering absorb the gate. Its seven checks survive as
     decision-surfacing guidance (`asset:signal-and-noise`, `asset:human-owns-the-outer-loop`).
   - **brief-writer** — V1's static-HTML decision-brief renderer. Its job — rendering decision
     state so the human can adjudicate a tradeoff — IS the live studio (ADR-0008); with no
     orchestrator-agent to spawn it, the static artifact is structurally redundant. Its
     analogy-first / name-both-sides / end-with-the-question framing carries as surfacing guidance
     (`asset:assess-tradeoffs-by-naming-both-sides`).

5. **Migration posture (supersedes §"Migration posture" above for this change).** The reshape is
   exactly the case that section's "Forward-only still holds" clause foresaw: drops + a rename +
   retypes = a **data migration**. `CURRENT_SCHEMA_VERSION` bumped 1→2 with the registry entry
   `agent-context-assembly-reshape` (`packages/core/src/migrations.ts` #2): agent rows drop the
   walls, extract the `asset:` refs out of the old prose into `context`/`rules`/`antiPatterns`
   (`context` falls back to the row's `references` asset refs so the required floor stays
   non-empty), and lagging rows forward-migrate on write via the existing `upcastAndValidate`
   boundary; the eager batch-migrate (ADR-0026 §7) drains the tail. The dropped field names
   (`owns`/`doesNotTouch`/`authority`/`requiredReading`) joined the retired-field denylist.

## References

- [ADR-0017](0017-cross-cutting-knowledge-tier.md) (the Library tier — the kind joins it),
  [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (`KIND_SPECS` → schema/renderer/template,
  the one-table-three-consumers contract this conforms to),
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the tier name + DBOS deferral),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md) (the CLI surface that reaches it + the
  `agents` namespace it is kept distinct from),
  [ADR-0026](0026-library-schema-migrations-and-health-checks.md) (the migration posture this is
  measured against — additive, no row upcast),
  [ADR-0032](0032-cite-graduation-mechanism.md) (the cite/graduation mechanism the memory-curator
  unit is recast to — signal-synthesis, not a cite-threshold),
  [ADR-0034](0034-process-artifacts-ways-of-working.md) (the `process` kind that landed first,
  making `agent` the eighth).
- [ADR-0004](0004-orchestrator-agent-boundary.md) / [ADR-0005](0005-orchestration-spine-code-vs-judgment.md)
  (routing is code — why session-orchestrator is obsolete-as-agent),
  [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (one owned loop — why the authority
  walls collapse), [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the prove-it-gate phases
  the test/build/uat trio became), [ADR-0008](0008-ui-drives-agents-approvals.md) (the human-held outer
  loop that absorbs the screener/brief-writer/memory-curator gating),
  [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md) (the graduation loop
  trace-explorer/memory-curator feed).
- `legacy/Agentic/agents/` (the V1 roster — the source these units are imported from, read-only),
  `packages/core/src/knowledge.ts` (`KIND_SPECS` + the `Knowledge` union the `agent` kind extends),
  `apps/studio/src/types.ts` (the studio taxonomy the `agent` category extends).
- The roster-mapping JSON supplied in the task brief (2026-06-10) — the per-entry disposition/rationale
  seeding the eleven units.
