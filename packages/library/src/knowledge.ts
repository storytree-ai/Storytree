import { z } from "zod";
import { Markdown } from "./schema.js";

/**
 * The cross-cutting knowledge tier (ADR-0017), encoded as a schema.
 *
 * A knowledge unit is a curated markdown body whose structure is fixed per kind
 * (definition / principle / pattern / guardrail / techstack / process / open-question / agent /
 * proposal / friction / arc / plan).
 * Round-1
 * authored every body against a per-kind template; Phase 1 makes that template the
 * *derived* artifact rather than the source.
 *
 * The single source of truth is {@link KIND_SPECS}: one ordered field table per kind.
 * From it we derive THREE things that therefore can never drift (ADR-0017 "templates -> schema"):
 *   (a) the zod {@link Knowledge} discriminated union (this file),
 *   (b) the body renderer `renderBody` (knowledge-render.ts), and
 *   (c) the blank template generator `generateTemplate` (knowledge-render.ts).
 *
 * Each field is markdown. The `lead` field renders as a bold-labelled one-liner
 * (`**In one line.** ...`); the rest render as `## Heading` sections.
 *
 * CITATIONS (docs/research/library-sources-unification.md): a unit cites related material ONLY via
 * the structured `references` field (`doc:`/`asset:` pointers); there is no body `## See also`
 * section. Renderers group `references` by target type into a live **Sources** view (see
 * {@link groupSources} in knowledge-sources.ts) — it is NOT part of the body round-trip. The
 * optional `provenance` field carries the residual attribution prose a bare pointer can't (origin,
 * "still open" caveats), rendered as one line under Sources.
 */

/** One field in a kind's body, in render order. Drives schema + renderer + template. */
export interface KindFieldSpec {
  /** The structured-field name on the knowledge object (e.g. `oneLine`, `whatItIs`). */
  readonly field: string;
  /**
   * True for the single lead field. The lead renders inline as `${heading} ${value}`
   * (the bold marker sits in `heading`, e.g. `**In one line.**`); it is NOT a `## ` section.
   * Exactly one field per kind has `lead: true`.
   */
  readonly lead: boolean;
  /**
   * For a lead field: the literal bold marker prefix (e.g. `**The principle.**`).
   * For a section field: the `## ` heading text WITHOUT the `## ` prefix (e.g. `What it is`).
   */
  readonly heading: string;
  /** The italic placeholder used by the blank template generator (wrapped in `_..._`). */
  readonly placeholder: string;
  /** Required fields are non-optional in the schema and always emitted by the template. */
  readonly required: boolean;
  /**
   * True for a TYPED REF-LIST field (ADR-0029 owner reshape): the value is a `string[]` of
   * `asset:<id>` pointers, not markdown prose. The renderer emits one `- asset:<id>` bullet per
   * entry; the schema enforces the `asset:` prefix (`doc:`/ADR refs are banned — agents *search*
   * ADRs via the library, they don't preload them). A required ref-list must be non-empty.
   */
  readonly refList?: boolean;
}

export type KnowledgeKind =
  | "definition"
  | "principle"
  | "pattern"
  | "guardrail"
  | "techstack"
  | "process"
  | "open-question"
  | "agent"
  | "proposal"
  | "friction"
  | "arc"
  | "plan"
  | "uat-criterion";

/**
 * The per-kind field tables. ORDER IS SIGNIFICANT: the renderer emits fields in this order
 * and the parser/round-trip relies on it. The placeholder strings are the canonical blank
 * templates (the `template-*` units in the runtime store) verbatim, so `generateTemplate`
 * reproduces them byte-for-byte.
 */
export const KIND_SPECS: Readonly<Record<KnowledgeKind, readonly KindFieldSpec[]>> = {
  definition: [
    {
      field: "oneLine",
      lead: true,
      heading: "**In one line.**",
      required: true,
      placeholder: "_What this term means, stated once — genus and differentia._",
    },
    {
      field: "whatItIs",
      lead: false,
      heading: "What it is",
      required: true,
      placeholder:
        "_The precise meaning: the category it belongs to and what distinguishes it within that category. Be exact._",
    },
    {
      field: "whatItIsNot",
      lead: false,
      heading: "What it is not",
      required: false,
      placeholder:
        "_The nearest neighbours it must not be confused with, and the distinction. Omit this section if the term has no easily-confused neighbour._",
    },
  ],
  principle: [
    {
      field: "statement",
      lead: true,
      heading: "**The principle.**",
      required: true,
      placeholder: "_The judgement rule, in one sentence._",
    },
    {
      field: "why",
      lead: false,
      heading: "Why",
      required: true,
      placeholder: "_What goes wrong without it — the cost it pays for._",
    },
    {
      field: "howToApply",
      lead: false,
      heading: "How to apply",
      required: true,
      placeholder:
        "_What following it looks like in practice: the test you run, the question you ask._",
    },
  ],
  pattern: [
    {
      field: "statement",
      lead: true,
      heading: "**The pattern.**",
      required: true,
      placeholder: "_The reusable approach, in one sentence._",
    },
    {
      field: "problem",
      lead: false,
      heading: "Problem",
      required: true,
      placeholder: "_The recurring situation this addresses._",
    },
    {
      field: "approach",
      lead: false,
      heading: "Approach",
      required: true,
      placeholder: "_The structure to apply — the shape or the steps._",
    },
    {
      field: "tradeoffs",
      lead: false,
      heading: "Tradeoffs",
      required: false,
      placeholder: "_What you trade — A vs B — in concrete, user-facing terms._",
    },
  ],
  guardrail: [
    {
      field: "statement",
      lead: true,
      heading: "**The boundary.**",
      required: true,
      placeholder: "_The line that must not be crossed, in one sentence._",
    },
    {
      field: "rule",
      lead: false,
      heading: "Rule",
      required: true,
      placeholder: "_The invariant, stated as a hard boundary._",
    },
    {
      field: "enforcedBy",
      lead: false,
      heading: "Enforced by",
      required: true,
      placeholder:
        "_The deterministic mechanism that makes this non-bypassable — a gate, a schema, a DB constraint, or a specific code path. If nothing deterministically enforces it, this is a `pattern`, not a guardrail._",
    },
    {
      field: "failureMode",
      lead: false,
      heading: "Failure mode prevented",
      required: true,
      placeholder: "_What breaks if the boundary is crossed._",
    },
  ],
  techstack: [
    {
      field: "statement",
      lead: true,
      heading: "**The choice.**",
      required: true,
      placeholder: "_What we build on, in one sentence._",
    },
    {
      field: "whatItIs",
      lead: false,
      heading: "What it is",
      required: true,
      placeholder: "_The technology and the role it plays in storytree._",
    },
    {
      field: "whyThis",
      lead: false,
      heading: "Why this",
      required: true,
      placeholder: "_What it buys us; what it was chosen over._",
    },
    {
      field: "constraints",
      lead: false,
      heading: "Constraints",
      required: false,
      placeholder: "_Version pins, boundaries, and what it must not be used for._",
    },
  ],
  process: [
    {
      field: "statement",
      lead: true,
      heading: "**The ceremony.**",
      required: true,
      placeholder: "_What this process accomplishes, in one sentence._",
    },
    {
      field: "trigger",
      lead: false,
      heading: "Trigger",
      required: true,
      placeholder:
        "_The moment a session runs this — the observable condition, not a vibe._",
    },
    {
      field: "steps",
      lead: false,
      heading: "Steps",
      required: true,
      placeholder:
        "_The ordered ceremony, one numbered step per action — each step names the command it runs or the surface it touches._",
    },
    {
      field: "surfaces",
      lead: false,
      heading: "Surfaces",
      required: true,
      placeholder:
        "_Which surfaces this touches — tree, noticeboard, library, repo/CI — and what it reads or writes on each. Name each ENACTING entrypoint as a backtick command — `storytree <area> …`, `pnpm <script> …`, or `pnpm --filter <app> <script> …` — so `check:surface-coverage` (ADR-0154) resolves it against the real CLI/pnpm surface._",
    },
    {
      field: "failureModes",
      lead: false,
      heading: "Failure modes",
      required: true,
      placeholder:
        "_What breaks when the ceremony is skipped or a step runs out of order — concrete incidents over hypotheticals._",
    },
    {
      field: "verification",
      lead: false,
      heading: "Verification",
      required: false,
      placeholder:
        "_What deterministically checks the ceremony was followed — a gate, a CI job, a test. If nothing checks it, say so explicitly._",
    },
  ],
  "open-question": [
    {
      field: "stakes",
      lead: true,
      heading: "**Why this matters.**",
      required: true,
      placeholder:
        "_What breaks, or what job is blocked, if this stays unsettled — one sentence a newcomer (or an agent without the repo loaded) understands, before any identifier or ADR number._",
    },
    {
      field: "statement",
      lead: false,
      heading: "The question",
      required: true,
      placeholder: "_The decision to settle, in one sentence._",
    },
    {
      field: "context",
      lead: false,
      heading: "Context",
      required: true,
      placeholder:
        "_Why it is open now — the forces and constraints, and what is blocked until it lands. Gloss every internal term, code identifier, and ADR number on first use._",
    },
    {
      field: "diagram",
      lead: false,
      heading: "Diagram",
      required: false,
      placeholder:
        "_A picture when the subject is a structure, flow, or state machine — a ```mermaid fenced block (rendered as an SVG in the studio, ADR-0096) or an ASCII box/flow diagram in a fenced code block. Omit for a pure value/policy choice._",
    },
    {
      field: "options",
      lead: false,
      heading: "Options",
      required: true,
      placeholder:
        "_The candidate answers, each with its trade-off (name both sides — A vs B)._",
    },
    {
      field: "recommendation",
      lead: false,
      heading: "Recommendation",
      required: false,
      placeholder:
        "_The proposed answer and why — explicitly non-binding until the owner decides._",
    },
  ],
  // The `agent` unit is the SOURCE of `storytree agents <name>` context assembly (ADR-0029 owner
  // reshape, 2026-06-11): fields are either per-role PROSE (role/outcome/tools/workflow/escalation)
  // or typed `asset:` REF-LISTS the renderer injects (context/rules/antiPatterns). Scope/authority
  // walls (the old owns/doesNotTouch/authority) are enforced by code and guardrails, never
  // described in guidance — they were dropped in schemaVersion 2 (migrations.ts #2).
  agent: [
    {
      field: "oneLine",
      lead: true,
      heading: "**The agent.**",
      required: true,
      placeholder: "_The role in one sentence — who it is and the single job it owns._",
    },
    {
      field: "role",
      lead: false,
      heading: "Role",
      required: true,
      placeholder:
        "_The full purpose: what this agent is for, what it produces, and the boundary of its job._",
    },
    {
      field: "outcome",
      lead: false,
      heading: "Outcome",
      required: true,
      placeholder:
        "_The success criteria: the observable, falsifiable condition that means this agent's work is done and correct._",
    },
    {
      field: "context",
      lead: false,
      heading: "Context",
      required: true,
      refList: true,
      placeholder:
        "_The assembly manifest — `asset:` refs whose content the `storytree agents <name>` renderer injects into this role's system prompt, one per line. ADR refs are banned: agents are told ADRs exist and search them just-in-time (`storytree library search`)._",
    },
    {
      field: "tools",
      lead: false,
      heading: "Tools",
      required: true,
      placeholder:
        "_The tool surface and canonical commands it is granted — kept minimal (least-authority), each named with why it is needed._",
    },
    {
      field: "workflow",
      lead: false,
      heading: "Workflow",
      required: true,
      placeholder:
        "_The arc it runs: session-start orientation, the ordered steps, and the stop condition._",
    },
    {
      field: "rules",
      lead: false,
      heading: "Rules",
      required: false,
      refList: true,
      placeholder:
        "_`asset:` refs to the principle/pattern units that are this role's behavioural floor — the renderer injects the cited units' content; never restate it here. Omit if none._",
    },
    {
      field: "antiPatterns",
      lead: false,
      heading: "Anti-patterns",
      required: false,
      refList: true,
      placeholder:
        "_`asset:` refs to the guardrail/cautionary units naming the failure modes this role must refuse — injected by the renderer. Omit if none._",
    },
    {
      field: "escalation",
      lead: false,
      heading: "Escalation",
      required: false,
      placeholder:
        "_What it surfaces rather than deciding — the boundary where it stops and routes to the human outer loop or the owning surface. Omit if it never escalates._",
    },
  ],
  // A `proposal` captures the INTENT of a change worth doing later — a rename, a
  // migration, a restructuring — so it can be parked in the library now and "kicked
  // off when ready" (typically a quiet window with no active sessions). It is forward-
  // looking like an open-question, but it is NOT a question: the decision is made, only
  // the EXECUTION is deferred. The fields carry everything the executing session needs:
  // the before→after change, the blast radius, the ordered migration steps, and the
  // readiness preconditions that say it is safe to start.
  proposal: [
    {
      field: "summary",
      lead: true,
      heading: "**The proposal.**",
      required: true,
      placeholder: "_The change being proposed, in one sentence — the decision is made; execution is deferred._",
    },
    {
      field: "motivation",
      lead: false,
      heading: "Motivation",
      required: true,
      placeholder:
        "_What prompts this — the friction it removes or the improvement it buys, and the cost of NOT doing it._",
    },
    {
      field: "change",
      lead: false,
      heading: "The change",
      required: true,
      placeholder:
        "_What concretely changes — the before→after mapping (renames, moved surfaces, new vocabulary). Name the old and the new term for each, exactly._",
    },
    {
      field: "scope",
      lead: false,
      heading: "Scope",
      required: true,
      placeholder:
        "_The blast radius: the surfaces, files, identifiers, and stored data the migration touches — and, explicitly, what it leaves UNCHANGED (the non-goals)._",
    },
    {
      field: "migration",
      lead: false,
      heading: "Migration plan",
      required: true,
      placeholder:
        "_The ordered steps to execute when this is kicked off — each step names the command, surface, or file it changes and how it is verified green._",
    },
    {
      field: "readiness",
      lead: false,
      heading: "Readiness",
      required: true,
      placeholder:
        "_The preconditions for safely running it (e.g. no active sessions on the noticeboard, the DB quiet, the gate green) and how a session knows it is time to start._",
    },
    {
      field: "risks",
      lead: false,
      heading: "Risks",
      required: false,
      placeholder:
        "_What could go wrong and the mitigation — half-applied renames, dangling references, data loss. Omit only if genuinely low-risk._",
    },
  ],
  // A `friction` item is the employees' upward voice channel (ADR-0168 D2): a session files WHAT
  // FOUGHT IT — with evidence, fail-closed — and a dedicated adjudicator later routes it. It joins
  // `open-question` and `proposal` in the Library's LIFECYCLE tier (transient-by-design, mandatory
  // drain): raw friction never graduates as itself; only its durable essence is extracted into
  // 'able' artifacts (ADR-0095 D5). Capture never classifies — there is no severity enum and no
  // taxonomy field; `route` is set only at adjudication (see FrictionRoute below, enum-fenced via
  // `.extend()`). The structured lifecycle fields (`provenance` / `reinforcedBy`) live OUTSIDE this
  // body table, on the schema — see the Friction schema below.
  friction: [
    {
      field: "statement",
      lead: true,
      heading: "**The friction.**",
      required: true,
      placeholder:
        "_What fought you, in one sentence — the obstacle itself, not the lesson you took from it._",
    },
    {
      field: "evidence",
      lead: false,
      heading: "Evidence",
      required: true,
      placeholder:
        "_Concrete citations — a command and its output excerpt, a file path, a PR#, a quoted error. An evidence-free item is refused at capture, fail-closed (ADR-0168 D3)._",
    },
    {
      field: "impact",
      lead: false,
      heading: "Impact",
      required: true,
      placeholder:
        "_What it cost — time, a red gate, a wrong build — and who hits it next._",
    },
    {
      field: "route",
      lead: false,
      heading: "Route",
      required: false,
      placeholder:
        "_Set only at adjudication, never at capture: adr | tool | principle | guardrail | process | definition | edit-existing | nothing._",
    },
    {
      field: "routeReason",
      lead: false,
      heading: "Route reason",
      required: false,
      placeholder:
        "_The justification-gate answers behind the route — or the archive-with-reason when the route is `nothing`._",
    },
  ],
  // An `arc` (ADR-0183 D1) is the initiative OVERLAY: a named multi-story intent tracked to a
  // closed end-state — the fourth grouping tier ADR-0002 parked, returned as an overlay, not a
  // tier: it references stories/ADRs/plans (every containment edge lives on the CHILD; the upward
  // view is derived by query, D3), and nothing proof-related rolls up to it. The studio displays
  // the kind as "Epic" (a display alias only — the kind key, CLI, and refs use `arc` exclusively).
  // Its durable residue is the structured `increments` landing log (schema-level, see ArcIncrement
  // below — the reinforcedBy precedent); the body stays minimal: an arc holds state and pointers
  // only. Lessons still graduate out through ADR-0095/0168, and implementation surface is banned
  // here (D4: surface lives only in anchored, disposable plans).
  arc: [
    {
      field: "intent",
      lead: true,
      heading: "**The intent.**",
      required: true,
      placeholder: "_The owner's initiative, in one sentence — what this arc exists to deliver._",
    },
    {
      field: "endState",
      lead: false,
      heading: "End state",
      required: true,
      placeholder:
        "_What closed looks like — the observable condition under which the arc is delivered and its increment log stops. Intent and outcomes only: a file list here is a staleness bug (ADR-0183 D4 — implementation surface lives in plans)._",
    },
  ],
  // A `plan` (ADR-0183 D2) is the disposable, git-anchored choreography for ONE increment of an
  // arc — the first EPHEMERAL kind (see EPHEMERAL_KINDS below): Postgres-only, never in
  // `knowledge.json` or any seed ceremony. Its structured lifecycle fields (`arcRef` / `anchor` /
  // `status`) live OUTSIDE this body table, on the schema — see the Plan schema below. Consumption
  // begins with a mechanical freshness check (git-log the paths the plan names since `anchor.sha`);
  // drift past threshold means re-plan, never repair. Once consumption starts a plan is never
  // edited — supersede it; the owning arc's increment log is what endures.
  plan: [
    {
      field: "objective",
      lead: true,
      heading: "**The objective.**",
      required: true,
      placeholder: "_What this increment of the arc delivers, in one sentence._",
    },
    {
      field: "decomposition",
      lead: false,
      heading: "Decomposition",
      required: true,
      placeholder:
        "_The provable units in dependency order — each names its story/capability id and its proof route: `--real` red→green, glue (ADR-0158), or operator-attested._",
    },
    {
      field: "lanes",
      lead: false,
      heading: "Lanes",
      required: false,
      placeholder:
        "_The parallel lanes: which units are independent, the expected file surface per lane (fence hints for the takers), and where lanes contend. Omit for a single-lane plan._",
    },
    {
      field: "budgets",
      lead: false,
      heading: "Budgets",
      required: false,
      placeholder:
        "_Expected spend per unit in turn-cap vocabulary (ADR-0130), sized by the ASSERT SURFACE (files authored × contracts to cover) not file size — e.g. the default 16 turns for a one-file, few-assert unit, `--max-turns 45` when it authors multiple files or covers many contracts. Omit when the defaults stand._",
    },
    {
      field: "traps",
      lead: false,
      heading: "Traps",
      required: false,
      placeholder:
        "_Known traps on this surface, and the escalation points where the executor halts for the owner rather than pushing through. Omit if none are known._",
    },
  ],
  // A `uat-criterion` (ADR-0209 D5/D6) is the seed-canonical detailed UAT acceptance contract:
  // action / success / evidence (+ optional principle/process refs). The story criterion keeps the
  // one-line display title — this kind deliberately has NO title-shaped lead field (action is the
  // lead). Port authority for the narrow detail body is `@storytree/uat-criterion`; this KIND_SPECS
  // entry is the Library recognition surface so Studio/CLI can resolve detail pointers.
  "uat-criterion": [
    {
      field: "action",
      lead: true,
      heading: "**Action.**",
      required: true,
      placeholder: "_What the UAT walk actually does._",
    },
    {
      field: "successConditions",
      lead: false,
      heading: "Success conditions",
      required: true,
      placeholder: "_What observable state constitutes success._",
    },
    {
      field: "evidenceExpectations",
      lead: false,
      heading: "Evidence expectations",
      required: true,
      placeholder: "_What evidence must be captured to attest the walk._",
    },
    {
      field: "refs",
      lead: false,
      heading: "References",
      required: false,
      refList: true,
      placeholder: "_Optional `asset:<id>` refs to reusable Library principles/processes._",
    },
  ],
} as const;

/**
 * The EPHEMERAL kind class (ADR-0183 D2): kinds that live ONLY in the live Postgres store. They
 * never appear in the seed (`knowledge.json`), and every seed ceremony ignores them —
 * `export-corpus` never carries them up, `sync-corpus` never carries them down, and the
 * `check:corpus-sync` gate warning skips them (else every live plan would read as seed drift
 * forever). `plan` is the first member: disposable choreography that is consumed and retired; the
 * owning arc's increment log is the durable residue. Typed `ReadonlySet<string>` so store/CLI
 * consumers can probe an untyped `doc.kind` without casting.
 */
export const EPHEMERAL_KINDS: ReadonlySet<string> = new Set<KnowledgeKind>(["plan"]);

/**
 * Fields shared by every knowledge kind. Mirrors the runtime-store JSON shape (the `kind`
 * discriminator maps from the source `category` key elsewhere; here it is `kind`).
 *
 * `references` are `doc:<relpath>` / `asset:<id>` pointers — the SINGLE citation source, rendered
 * grouped-by-type as "Sources" ({@link groupSources}). `provenance` is the optional attribution
 * line (markdown) shown under Sources for prose a bare pointer can't carry.
 */
const commonShape = {
  id: z.string(),
  title: z.string(),
  description: z.string(), // one-line
  /**
   * Per-ROW schema version pin (design §3/§5: library-schema-migrations-and-health-checks.md).
   * Absent => 0 (the pre-pin world): the field is optional-with-default, so `.strict()` still
   * accepts existing docs that never carried it. The write-boundary upcaster
   * ({@link upcast} in migrations.ts) stamps it to `CURRENT_SCHEMA_VERSION`.
   */
  schemaVersion: z.number().int().nonnegative().default(0),
  references: z.array(z.string()).default([]),
  provenance: Markdown.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
} as const;

/**
 * One typed `asset:<id>` pointer — the only ref a {@link KindFieldSpec.refList} field admits.
 * `doc:` (ADR) refs are deliberately rejected: ADRs are *searched* just-in-time, never preloaded
 * into an agent's assembled context (ADR-0029 owner reshape; ADR-0023 §6 search).
 */
export const AssetRef = z.string().regex(/^asset:[A-Za-z0-9_-]+$/, {
  message: "a ref-list entry must be an `asset:<id>` pointer (doc:/ADR refs are banned here)",
});

/**
 * One workflow-step → refs edge on an agent (ADR-0156 §4; ADR-0161 the node-keyed context DAG): a
 * named workflow step keyed to the ORDERED `asset:` refs that step pulls just-in-time. This is the
 * agent-step NODE of the one Library context DAG — its `refs` are the node's outbound edges, served
 * as an ADR-0023 `next:` envelope by `storytree agents <name> --step` (via the shared `node → next:`
 * emitter). The essentials renderer (ADR-0156 §1d) derives its per-step doors from the same field.
 * Structured metadata, deliberately NOT a KIND_SPECS body section — it does not round-trip through
 * the markdown body (like `references`).
 */
export const AgentStepRef = z
  .object({
    /** The workflow step this keys — matches a step named in the agent's `workflow` prose. */
    step: z.string().min(1),
    /** The ordered `asset:<id>` refs this step hands on to (the node's outbound edges). */
    refs: z.array(AssetRef),
  })
  .strict();
export type AgentStepRef = z.infer<typeof AgentStepRef>;

/**
 * The model TIER a delegatable agent runs on when a harness spawns it (ADR-0182, amending ADR-0178 §3
 * which fixed every subagent at `inherit`). A tier, NOT a raw model id — so it survives model-version
 * bumps and maps cleanly onto both harness frontmatter contracts (`.claude/agents` and `.cursor/agents`
 * both accept these `model:` values). `inherit` keeps the ADR-0178 default (the spawning session's
 * model); `sonnet`/`opus` pin the workhorse/judgment split (leverage Sonnet as the workhorse, Opus for
 * judgment-heavy roles). Like `stepRefs` this is structured schema metadata the renderer reads into
 * frontmatter, never a KIND_SPECS body section — it does not round-trip through the markdown body.
 */
export const AgentModel = z.enum(["inherit", "sonnet", "opus"]);
export type AgentModel = z.infer<typeof AgentModel>;

/**
 * One branch-edge on a `process` node (ADR-0154's process-graph follow-on, un-deferred by ADR-0161;
 * the node-keyed context DAG): a process's outbound edge to the artifact/node it hands on to, with an
 * optional one-line gloss. This is the process NODE of the one Library context DAG — the counterpart
 * to an agent-step's `refs`. Its parsed shape is deliberately COMPATIBLE with the shared emitter's
 * `NodeEdge` (`packages/drive/src/envelope.ts`: `{ ref, label? }`) so a process's edges map straight
 * into a `ContextNode` and derive the same ADR-0023 `next:` envelope via `emitNodeEnvelope` (ADR-0161
 * decision 2 — one emitter, never a bespoke per-surface `next:`). The library never imports drive; the
 * shapes are kept trivially mappable, not shared by import. Structured metadata, deliberately NOT a
 * KIND_SPECS body section — it does not round-trip through the markdown body (like `references` /
 * `stepRefs`). Increment 7b derives the process `next:` graph from this field.
 */
export const ProcessBranchEdge = z
  .object({
    /** The target this edge hands on to — an `asset:<id>` Library pointer (maps to `NodeEdge.ref`). */
    ref: AssetRef,
    /** An optional one-line gloss shown beside the pull command (maps to `NodeEdge.label`). */
    label: z.string().min(1).optional(),
  })
  .strict();
export type ProcessBranchEdge = z.infer<typeof ProcessBranchEdge>;

/**
 * The closed set of adjudication routes a `friction` item can take (ADR-0168 D2/D5). The `route`
 * body field is enum-fenced to exactly these at the schema (via `.extend()` below) so a free-prose
 * classification can never be written — capture never classifies, and adjudication picks from the
 * D5 routing table, never invents. `nothing` is the archive-with-reason tombstone.
 */
export const FrictionRoute = z.enum([
  "adr",
  "tool",
  "principle",
  "guardrail",
  "process",
  "definition",
  "edit-existing",
  "nothing",
]);
export type FrictionRoute = z.infer<typeof FrictionRoute>;

/**
 * A `friction` item's capture provenance (ADR-0168 D2): which branch/session filed it, when, and
 * through which producer — `retro` (the session-orchestrator's capped session retro, D1) or
 * `run-analysis` (the per-run `friction-analyst`). STRUCTURED on this kind: it REPLACES the
 * commonShape markdown `provenance` attribution line via `.extend()` (friction provenance is data
 * the adjudicator and the staleness tripwires read, not prose). Like `stepRefs`/`branchEdges` it is
 * schema-level metadata, never a KIND_SPECS body section — it does not round-trip through markdown.
 */
export const FrictionProvenance = z
  .object({
    /** The branch (session) that filed the item. */
    branch: z.string().min(1),
    /** When it was filed (ISO date). */
    date: z.string().min(1),
    /** Which producer filed it (ADR-0168 D1: the retro, or the per-run friction-analyst). */
    source: z.enum(["retro", "run-analysis"]),
  })
  .strict();
export type FrictionProvenance = z.infer<typeof FrictionProvenance>;

/**
 * One reinforcement of an existing `friction` item (ADR-0168 D2): recurrence reinforces, never
 * duplicates — a session that re-hits a filed trap appends here instead of minting a twin.
 * `evidence` is REQUIRED on every entry (the D3 fail-closed floor applies to reinforcements too;
 * an evidence-free "me too" is exactly the slop the capture fence exists to refuse).
 * `reinforcedBy.length` is testimony the adjudicator weighs — never a threshold.
 */
export const FrictionReinforcement = z
  .object({
    /** The branch (session) that re-hit the trap. */
    branch: z.string().min(1),
    /** When (ISO date). */
    date: z.string().min(1),
    /** The reinforcing session's OWN concrete evidence — required, fail-closed. */
    evidence: z.string().min(1),
  })
  .strict();
export type FrictionReinforcement = z.infer<typeof FrictionReinforcement>;

/**
 * One landed increment on an `arc` (ADR-0183 D1): the durable residue the initiative keeps after
 * its plans are pruned. Appended at LANDING (the merge ceremony) — the arc's only fast-moving
 * authored mutation — and append-only, like the decision log. `outcome` is required (what landed,
 * halted, or was re-planned, and what was consumed); `pr` is optional because an increment can
 * close without its own PR (an owner attestation, an honest halt). Like `reinforcedBy` on
 * `friction`, this is schema-level metadata, never a KIND_SPECS body section — it does not
 * round-trip through markdown.
 */
export const ArcIncrement = z
  .object({
    /** When the increment landed / closed (ISO date). */
    date: z.string().min(1),
    /** The landing PR(s) or ref, when there is one (e.g. "#676"). */
    pr: z.string().min(1).optional(),
    /** What happened: landed / halted / re-planned — and what was consumed. */
    outcome: z.string().min(1),
  })
  .strict();
export type ArcIncrement = z.infer<typeof ArcIncrement>;

/**
 * A `plan`'s git anchor (ADR-0183 D2): the commit the choreography was planned against.
 * Consumption begins with a mechanical freshness check — git-log the paths the plan names since
 * `sha`; drift past threshold means re-plan, not repair. This is the proof tier's anchor /
 * source-drift move (`packages/orchestrator/src/proof/source-drift.ts`) applied to intentions:
 * staleness is checked mechanically at consumption, never assumed absent.
 */
export const PlanAnchor = z
  .object({
    /** The git commit SHA the plan was authored against (7–40 lowercase hex chars). */
    sha: z.string().regex(/^[0-9a-f]{7,40}$/, {
      message: "anchor.sha must be a lowercase hex git SHA (7-40 chars)",
    }),
    /** When it was authored (ISO date). */
    date: z.string().min(1),
  })
  .strict();
export type PlanAnchor = z.infer<typeof PlanAnchor>;

/**
 * The closed lifecycle of a `plan` (ADR-0183 D2): born `draft`, flipped `ready` for consumption,
 * then `consumed` (execution started — never edited again; re-planning supersedes), `superseded`
 * (replaced by a fresher plan), or `retired` (pruned/abandoned; consumed plans are prunable — the
 * arc's increment log is what endures). Enum-fenced at the schema so a free-prose state can never
 * be written (the FrictionRoute precedent).
 */
export const PlanStatus = z.enum(["draft", "ready", "consumed", "superseded", "retired"]);
export type PlanStatus = z.infer<typeof PlanStatus>;

/**
 * Build a per-kind zod object from its field spec table. Required fields are `Markdown`;
 * optional fields are `Markdown.optional()`; `refList` fields are `asset:` ref arrays
 * (required => non-empty). The `kind` literal discriminates the union.
 */
function buildKindSchema(kind: KnowledgeKind) {
  const fieldShape: Record<string, z.ZodTypeAny> = {};
  for (const spec of KIND_SPECS[kind]) {
    if (spec.refList === true) {
      fieldShape[spec.field] = spec.required
        ? z.array(AssetRef).min(1)
        : z.array(AssetRef).optional();
    } else {
      fieldShape[spec.field] = spec.required ? Markdown : Markdown.optional();
    }
  }
  return z
    .object({
      kind: z.literal(kind),
      ...commonShape,
      ...fieldShape,
    })
    .strict();
}

export const Definition = buildKindSchema("definition");
export const Principle = buildKindSchema("principle");
export const Pattern = buildKindSchema("pattern");
export const Guardrail = buildKindSchema("guardrail");
export const TechStack = buildKindSchema("techstack");
// The `process` kind carries one structured field OUTSIDE its KIND_SPECS body table: `branchEdges`,
// the process-graph outbound edges (ADR-0154 follow-on, un-deferred by ADR-0161). Like `stepRefs` on
// `agent`, it is navigation metadata, not a rendered body section — so it lives on the schema like
// `references` does, never in KIND_SPECS (so `renderBody`/`generateTemplate` ignore it; it does not
// round-trip through markdown). OPTIONAL, so every existing process doc (authored before the field)
// still validates — NO `CURRENT_SCHEMA_VERSION` bump / migration. `.extend()` preserves the `.strict()`
// from buildKindSchema (unknown fields still fail closed) and the `kind` literal (the discriminated
// union is unaffected). Increment 7b derives the process `next:` graph from this field.
export const Process = buildKindSchema("process").extend({
  branchEdges: z.array(ProcessBranchEdge).optional(),
});
export const OpenQuestion = buildKindSchema("open-question");
// The `agent` kind carries one structured field OUTSIDE its KIND_SPECS body table: `stepRefs`, the
// workflow-step → refs association (ADR-0156 §4 / ADR-0161). It is metadata, not a rendered body
// section — so it lives on the schema like `references` does, never in KIND_SPECS. OPTIONAL, so every
// existing agent doc (authored before the field) still validates; increment 5 populates it across the
// well-behaved agents. `.extend()` preserves the `.strict()` from buildKindSchema (unknown fields
// still fail closed) and the `kind` literal (the discriminated union is unaffected).
export const Agent = buildKindSchema("agent").extend({
  stepRefs: z.array(AgentStepRef).optional(),
  // The model TIER this delegatable agent's harness subagent file pins (ADR-0182, amending ADR-0178
  // §3's `inherit`-only minimum). OPTIONAL — an agent without it renders `model: inherit` exactly as
  // before, so every existing agent doc still validates with NO `CURRENT_SCHEMA_VERSION` bump /
  // migration, and the discriminated union + `.strict()` fail-closed are preserved (the `stepRefs`
  // precedent). Frontmatter-only metadata; the renderers read it, the body never does.
  model: AgentModel.optional(),
});
export const Proposal = buildKindSchema("proposal");
// The `friction` kind (ADR-0168 D2) tightens THREE fields beyond its KIND_SPECS table via
// `.extend()` (the `stepRefs`/`branchEdges` precedent — `.strict()` and the `kind` literal are
// preserved): `route` is enum-fenced to the closed adjudication set (a body field, so it still
// renders/templates from KIND_SPECS — the schema just refuses free prose); `provenance` is the
// STRUCTURED capture record {branch, date, source}, REPLACING the commonShape markdown attribution
// line for this kind only; `reinforcedBy` is the recurrence log (evidence required per entry).
// All three are optional at capture, so no `CURRENT_SCHEMA_VERSION` bump and zero migration — a
// NEW kind touches no existing doc (verified against migrations.ts: every registered migration is
// a per-doc transform that no-ops on a fresh friction doc).
export const Friction = buildKindSchema("friction").extend({
  route: FrictionRoute.optional(),
  provenance: FrictionProvenance.optional(),
  reinforcedBy: z.array(FrictionReinforcement).optional(),
});
// The `arc` kind (ADR-0183 D1) carries one structured field OUTSIDE its KIND_SPECS body table:
// `increments`, the append-at-landing log that is the initiative's durable residue (the
// `reinforcedBy` precedent — schema-level metadata, never a rendered body section; it does not
// round-trip through markdown). OPTIONAL — a freshly-born arc has no landings yet. `.extend()`
// preserves `.strict()` and the `kind` literal; a NEW kind touches no existing doc, so there is no
// `CURRENT_SCHEMA_VERSION` bump and zero migration (the ADR-0168 friction precedent, re-verified:
// every registered migration is a per-doc transform that no-ops on a fresh arc/plan doc).
export const Arc = buildKindSchema("arc").extend({
  increments: z.array(ArcIncrement).optional(),
});
// The `plan` kind (ADR-0183 D2/D3) carries three structured fields beyond its KIND_SPECS table:
// `arcRef` is REQUIRED — a plan is born citing its arc (D3: the containment edge lives on the
// child; the arc's plan view is derived by query, never authored on the arc); `anchor` is the
// REQUIRED git anchor the consumption-time freshness check runs against; `status` is the
// enum-fenced lifecycle, defaulting to `draft` at birth. Ephemeral (see EPHEMERAL_KINDS):
// live-store-only, excluded from every seed ceremony, so there is no seed round-trip to preserve.
export const Plan = buildKindSchema("plan").extend({
  arcRef: AssetRef,
  anchor: PlanAnchor,
  status: PlanStatus.default("draft"),
});
// The `uat-criterion` kind (ADR-0209 D5/D6): seed-canonical detailed UAT acceptance. Built from
// KIND_SPECS only — no structured extras. commonShape still supplies Library card `title` /
// `description` for navigation; the story criterion remains display-canonical for UAT row
// one-liners (`displayTitle` from `@storytree/uat-criterion`). NEW kind → no schemaVersion bump.
export const UatCriterion = buildKindSchema("uat-criterion");

/** A knowledge unit at any kind. The discriminator is `kind` (ADR-0017). */
export const Knowledge = z.discriminatedUnion("kind", [
  Definition,
  Principle,
  Pattern,
  Guardrail,
  TechStack,
  Process,
  OpenQuestion,
  Agent,
  Proposal,
  Friction,
  Arc,
  Plan,
  UatCriterion,
]);

export type Knowledge = z.infer<typeof Knowledge>;
export type Definition = z.infer<typeof Definition>;
export type Principle = z.infer<typeof Principle>;
export type Pattern = z.infer<typeof Pattern>;
export type Guardrail = z.infer<typeof Guardrail>;
export type TechStack = z.infer<typeof TechStack>;
export type Process = z.infer<typeof Process>;
export type OpenQuestion = z.infer<typeof OpenQuestion>;
export type Agent = z.infer<typeof Agent>;
export type Proposal = z.infer<typeof Proposal>;
export type Friction = z.infer<typeof Friction>;
export type Arc = z.infer<typeof Arc>;
export type Plan = z.infer<typeof Plan>;
export type UatCriterion = z.infer<typeof UatCriterion>;

/**
 * The known top-level field names of a structured Knowledge kind, read straight from that kind's
 * (strict) schema shape via the discriminated union's `optionsMap`. Includes both KIND_SPECS body
 * fields and the schema-level extras (`increments`, `route`, `stepRefs`, …). Returns null for a kind
 * that is not a structured Knowledge kind — a rendered LibraryAsset carries `category`, not `kind`.
 *
 * Its reason for existing: a write surface (the CLI's `artifact edit`) can check a `--set field=…`
 * name against this set and reject a typo'd field with a CLEAR message, instead of the opaque
 * discriminated-union "Unrecognized key(s)" dump the `.strict()` schema throws. Drift-proof: the set
 * is derived from the live schema, never a hand-maintained list.
 */
export function knownFieldsForKind(kind: string): ReadonlySet<string> | null {
  const schema = Knowledge.optionsMap.get(kind as KnowledgeKind);
  if (schema === undefined) return null;
  return new Set(Object.keys(schema.shape));
}
