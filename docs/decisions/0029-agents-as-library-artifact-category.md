# ADR-0029: The agent roster is a Library artifact category (`agent` kind)

## Status

proposed (2026-06-10) — adds a seventh `kind` to the Library
([ADR-0017](0017-cross-cutting-knowledge-tier.md) /
[ADR-0019](0019-library-tier-name-and-defer-dbos.md)) under the schema-driven `KIND_SPECS`
contract ([ADR-0018](0018-knowledge-tier-phase1-structured-source.md)), reached by the same
choose-your-own-adventure CLI ([ADR-0023](0023-library-cli-choose-your-own-adventure.md)) and
governed by the same migration posture ([ADR-0026](0026-library-schema-migrations-and-health-checks.md)).
Records the V1 (`legacy/Agentic`) agent roster as durable, citable Library units rather than letting
the roster mapping live only in branch memory. **This is a design proposal only** — it changes no
code (`packages/core/knowledge.ts`, `packages/store`, `apps/studio`) and seeds no live DB rows; it
specifies the shape a later, gated build conforms to.

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

1. **Add a seventh Library `kind`: `agent`.** It joins
   `definition | principle | pattern | guardrail | techstack | open-question` as a first-class,
   zod-validated, CLI-reachable artifact category. An `agent` unit captures **what a v2 agent (or an
   obsolete-V1-agent disposition) is**: its role, the surface it owns, its authority floor, the proof
   it must produce, the context it reads, and its operating discipline — folded down from V1's five
   buckets into one knowledge unit, with explicit provenance to the V1 source and a pointer to the v2
   surface that carries it.

2. **The structured field table (`KIND_SPECS.agent`), in render order.** One lead field plus eleven
   `## ` section fields. Mapping from V1's five buckets is given in §"V1 bucket → v2 field" below.

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

7. **Obsolete-as-agent dispositions are recorded too, not silently dropped.** The roster mapping (cited
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
| trace-explorer | evolve | `friction-analyst` (read-only over the event store, feeding the notice-board) |
| brief-writer | obsolete | the studio (the live web IDE supersedes the static HTML brief) |
| guidance-writer | evolve → merge | `library-curator` (merged with story-writer; `storytree agents <name>` namespace) |
| memory-curator | evolve | the notice-board curation step (spine proposes, human approves graduation) |

The full per-entry rationale (why obsolete vs evolve, what discipline carries, which ADR absorbs each
surface) is the body of each unit; it is supplied to the drafting/authoring phase as the roster JSON in
the task brief, not re-typed here.

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
  source-fix-not-bandaid → a `principle`). The intended posture (per ADR-0023 §9 / the V1 guidance-
  writer's reference-don't-restate discipline) is that the `agent` unit's *Rules* field **cites** those
  units via `references` rather than restating them — the agent unit is the role's index, not a copy of
  the doctrine.

## Open questions for the owner

1. **`agent` vs the `storytree agents <name>` namespace — keep them distinct, or bind them?** This ADR
   keeps the *kind* (a Library record of a role) and the *namespace* (ADR-0023 §7 context assembly)
   separate. Should a later build make `storytree agents <name>` read its role's `agent` unit as a
   context input, and if so is the `agent` unit's `requiredReading`/`rules` the *source* of that
   assembly or merely a human-readable mirror of it? (ADR-0011 territory; flagged, not decided.)

2. **Glossary projection for agents?** `commonShape` lets any kind be a glossary member
   (`glossarySection`/`glossaryTerm`/`glossaryBody`). Should the v2 agent names (`library-curator`,
   `friction-analyst`, the prove-it-gate phases) become glossary terms, or stay Library-only? (Leaning
   Library-only — they are roles, not vocabulary — but the owner holds the glossary surface.)

3. **Should obsolete-as-agent units live in the `agent` kind at all, or in a `lifecycle-status`-style
   note?** Recording dissolutions as `agent` units (decision §7) makes the mapping uniform and
   queryable, but an "obsolete agent" is arguably a *historical* record more than a live role — closer
   to an ADR than an artifact (ADR-0017: "ADRs are history, not artifacts"). Alternative: record only the
   six surviving agents as `agent` units and fold the five obsoletions into this ADR's prose. (Leaning
   "record all eleven" so the mapping is one queryable set, but flagged.)

4. **Drift-guard scope.** Is a `KIND_SPECS`↔zod parity test enough, or should there be an additional
   contract asserting "every `agent` unit's `references` resolves to a real ADR/surface" (the
   referential-integrity check of ADR-0026 §6, which currently starts as WARN)? Recommend WARN at first,
   graduating to GATE once the eleven seed units are clean — consistent with ADR-0026's GATE-vs-WARN
   posture.

5. **Required vs optional split.** This draft makes `rules`/`antiPatterns`/`escalation`/`doesNotTouch`
   optional (an obsolete agent or a thin new role may have none) and the rest required. Confirm the
   floor — in particular whether `outcome` should be required for an *obsolete* agent (which has no live
   success criteria); the draft keeps it required and expects an obsolete unit to state "n/a — obsolete;
   superseded by <surface>" rather than omit it.

## References

- [ADR-0017](0017-cross-cutting-knowledge-tier.md) (the Library tier — the kind joins it),
  [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (`KIND_SPECS` → schema/renderer/template,
  the one-table-three-consumers contract this conforms to),
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the tier name + DBOS deferral),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md) (the CLI surface that reaches it + the
  `agents` namespace it is kept distinct from),
  [ADR-0026](0026-library-schema-migrations-and-health-checks.md) (the migration posture this is
  measured against — additive, no row upcast).
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
