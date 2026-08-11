import { z } from "zod";
import { Markdown } from "./schema.js";

/**
 * The cross-cutting knowledge tier (ADR-0017), encoded as a schema.
 *
 * A knowledge unit is a curated markdown body whose structure is fixed per kind
 * (definition / principle / pattern / guardrail / techstack / process / open-question / agent /
 * friction / arc / plan).
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
  // `proposal` was RETIRED by ADR-0298 — the deferred-work tier is an entry ON an arc
  // ({@link ArcProposal} / `Arc.proposals`), never a kind of its own. Do not re-add it.
  | "friction"
  | "arc"
  | "increment"
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
        "_Which surfaces this touches — tree, noticeboard, library, repo/CI — and what it reads or writes on each. Name each ENACTING entrypoint as a backtick command — `storytree <area> …`, `pnpm <script> …`, or `pnpm --filter <app> <script> …` — so a reader can resolve it against the real CLI/pnpm surface and RUN it. `check:surface-coverage` (ADR-0154) used to resolve these automatically, but ADR-0311 D2 retired that rung on 2026-08-05: nothing checks the naming now, so it holds only where authors hold it._",
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
  // NOTE: there is no `proposal` entry here. ADR-0298 retired the kind — deferred, decided-but-
  // unbuilt work is an entry ON the arc that owns it ({@link ArcProposal} / `Arc.proposals`), which
  // carries this table's fields verbatim as schema-level metadata rather than a rendered body.
  //
  // A `friction` item is the employees' upward voice channel (ADR-0168 D2): a session files WHAT
  // FOUGHT IT — with evidence, fail-closed — and a dedicated adjudicator later routes it. It joins
  // `open-question` in the Library's LIFECYCLE tier (transient-by-design, mandatory drain) — ADR-0168
  // D2 named a third member, `proposal`, which ADR-0298 retired into `Arc.proposals`; the drain it
  // carried did not go with it (see {@link ArcProposal}). Raw friction never graduates as itself;
  // only its durable essence is extracted into
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
  // A `plan` (ADR-0183 D2) is the git-anchored choreography for ONE increment of an arc — an
  // EPHEMERAL kind (see EPHEMERAL_KINDS below): Postgres-only, never in any seed ceremony.
  // Its structured lifecycle fields (`arcRef` / `anchor` / `status`) live OUTSIDE this body table,
  // on the schema — see the Increment schema below. Consumption begins with a mechanical freshness check
  // (git-log the paths the body names since `anchor.sha`); drift past threshold means re-plan, never
  // repair. Once execution starts it is never edited — supersede it.
  //
  // TWO body fields, not five (ADR-0305 D4). `decomposition` / `lanes` / `budgets` / `traps` were
  // EDITORIAL, never structural: `PLAN_BODY_FIELDS` in `packages/cli/src/plan.ts` concatenated all
  // five and regex-mined them identically, so no reader ever distinguished a lane from a budget.
  // Their real function was to prompt the expensive planner model to think about contention and
  // spend — prompt engineering, which belongs in the `planner` agent's authoring guidance where a
  // checklist can actually be enforced, not in a schema the machine cannot use.
  //
  // ONE convention survives the collapse and is now load-bearing on `body` ALONE (D4): the freshness
  // check mines BACKTICK-QUOTED paths, and reports a plan naming none as VACUOUS — explicitly not a
  // green. File surfaces must still be named in backticks, which is why the placeholder says so.
  increment: [
    {
      field: "objective",
      lead: true,
      heading: "**The objective.**",
      required: true,
      placeholder: "_What this increment of the arc delivers, in one sentence._",
    },
    {
      field: "body",
      lead: false,
      heading: "The increment",
      required: true,
      placeholder:
        "_The choreography, in prose: the provable units in dependency order with each one's proof route (`--real` red→green, glue per ADR-0158, or operator-attested), which units are independent and where they contend, expected spend in turn-cap vocabulary (ADR-0130), and the known traps + escalation points. **Name every file surface in `backticks`** — the freshness check mines backtick-quoted paths, and an increment naming none gets a VACUOUS verdict, not a green._",
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
export const EPHEMERAL_KINDS: ReadonlySet<string> = new Set<KnowledgeKind>(["increment"]);

/*
 * SEED_SCOPE_KINDS stood here (ADR-0263): the allowlist of kinds the committed
 * `apps/studio/data/knowledge.json` was the canonical home of, and therefore the only kinds the
 * seed ceremonies carried in either direction. ADR-0302 D1 decommissioned the seed and D4 deleted
 * `export-corpus` / `sync-corpus` / `sync-agents` and their three gate rungs, so there is no
 * ceremony left for a scope to bound and every kind is live-only on the same terms. Deleted rather
 * than kept as an inert list (ADR-0302 D4) — a surviving allowlist would read as a live distinction
 * between kinds that no longer exists. EPHEMERAL_KINDS above is a DIFFERENT question (is this kind
 * disposable?) and is untouched.
 */

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
 * The two WORK-HIERARCHY pointer schemes (ADR-0306 D1): `story:<id>` and `capability:<id>`.
 *
 * `AssetRef` names a Library artifact and `doc:` names an ADR file; neither can name a story or a
 * capability, because those are not Library artifacts at all — they are the disk-canonical work
 * hierarchy under `stories/**` (ADR-0002/0010). Until these existed, an artifact wanting to cite one
 * had no option but PROSE, which is why ADR-0183 D2's `decomposition` named its units in markdown
 * where nothing could query them, validate them, or notice a rename.
 *
 * They are CITATION edges, never containment ones: ADR-0183 D3's rule that every containment edge
 * lives on the child is untouched, and nothing about an arc's or a story's ownership changes.
 *
 * NOT a duplicate of `node:<id>` (ADR-0107 D2), and the difference is the point. `node:` is a
 * TIER-BLIND anchor for a proving process — it names a unit without saying what tier it is, so
 * answering "which increments touch this CAPABILITY" through it would mean resolving every ref
 * against disk first, and a checkout missing the story would answer wrongly rather than not at all.
 * These carry the tier in the token, so the question is answerable from the store alone.
 */
export const STORY_REF_PREFIX = "story:";
export const CAPABILITY_REF_PREFIX = "capability:";

/** The three schemes a {@link CiteRef} admits — the mixed set ADR-0306 D2 puts on an increment. */
export type CiteScheme = "story" | "capability" | "asset";

/**
 * One entry of an increment's `cites` (ADR-0306 D2): a `story:` / `capability:` work-hierarchy
 * pointer, or an `asset:` Library pointer for the guidance it stands on.
 *
 * ONE regex rather than a union of three, so a malformed entry gets one message naming all three
 * legal schemes instead of zod's three-branch union dump. `doc:` stays banned for the reason
 * `AssetRef` bans it (ADR-0029: ADRs are searched just-in-time, never preloaded).
 */
export const CiteRef = z.string().regex(/^(?:story|capability|asset):[A-Za-z0-9_-]+$/, {
  message:
    "a `cites` entry must be a `story:<id>`, `capability:<id>` or `asset:<id>` pointer " +
    "(doc:/ADR refs are banned here — ADR-0029)",
});

/**
 * PURE: split a citation pointer into its scheme and id, or null when it is neither.
 *
 * Total and non-throwing — every reader of `cites` (the resolver, the health check, the render)
 * parses through this one function so the token layout is defined in exactly one place. It accepts
 * only the three {@link CiteRef} schemes: a `doc:`/`node:`/unknown token returns null rather than
 * being coerced into a shape the caller would then resolve against the wrong tree.
 */
export function parseCiteRef(ref: string): { scheme: CiteScheme; id: string } | null {
  const i = ref.indexOf(":");
  if (i < 0) return null;
  const scheme = ref.slice(0, i);
  const id = ref.slice(i + 1);
  if (id === "") return null;
  if (scheme === "story" || scheme === "capability" || scheme === "asset") return { scheme, id };
  return null;
}

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
 * The landing (or other terminal event) that CLOSED one increment (ADR-0305 D5).
 *
 * This is `ArcIncrement`'s shape moved onto the artifact it describes, with `ArcProposalRealization`
 * — its exact duplicate — removed. Absent until the increment closes; written in the SAME closing leg
 * that already runs the merge ceremony's residue step (ADR-0271), which is what keeps recording one
 * cheap.
 *
 * `note` is what makes `closed` honest as a SINGLE terminal state. ADR-0305 D2 removed `superseded`
 * and `retired` on the grounds that both were terminal and differed only in WHY the work stopped —
 * a reason string wearing a state's clothes. The reason lands here instead, which is also what lets a
 * wrong or duplicate increment be closed with its reason stated rather than marked realized: a false
 * landing on the very tier that exists to prevent them.
 */
export const IncrementOutcome = z
  .object({
    /** When it closed (ISO date). */
    date: z.string().min(1),
    /** The landing PR(s) or ref, when there is one (e.g. "#676"). */
    pr: z.string().min(1).optional(),
    /** WHY it closed — required by {@link assertIncrementInvariants} when there is no `pr`. */
    note: z.string().min(1).optional(),
  })
  .strict();
export type IncrementOutcome = z.infer<typeof IncrementOutcome>;

/*
 * `ArcIncrement`, `ArcProposalRealization` and `ArcProposal` stood here. ADR-0305 D1 collapsed all
 * three into the one `increment` kind, so the arc's two structured arrays — and the pair of
 * identical `{date, pr?, note|outcome}` shapes written twice — are gone. What each carried now lives
 * on the increment doc itself: an entry's body is `objective` + `body`, its parking stamp is
 * `parked`, its delivery join is `frictionRefs`, and its landing is {@link IncrementOutcome}. The
 * lifecycle field that used to be implied by WHICH ARRAY a row sat in is now stated outright as
 * {@link IncrementStatus}.
 */

/**
 * A `plan`'s git anchor (ADR-0183 D2): the commit the choreography was planned against.
 * Consumption begins with a mechanical freshness check — git-log the paths the plan names since
 * `sha`; drift past threshold means re-plan, not repair. This is the proof tier's anchor /
 * source-drift move (`packages/orchestrator/src/proof/source-drift.ts`) applied to intentions:
 * staleness is checked mechanically at consumption, never assumed absent.
 */
export const IncrementAnchor = z
  .object({
    /** The git commit SHA the plan was authored against (7–40 lowercase hex chars). */
    sha: z.string().regex(/^[0-9a-f]{7,40}$/, {
      message: "anchor.sha must be a lowercase hex git SHA (7-40 chars)",
    }),
    /** When it was authored (ISO date). */
    date: z.string().min(1),
  })
  .strict();
export type IncrementAnchor = z.infer<typeof IncrementAnchor>;

/**
 * The closed lifecycle of ONE increment of arc work (ADR-0305 D2): born `proposal` (decided, not
 * started), flipped `ready` when it is authored and consumable, `active` once execution starts
 * (never edited again — re-planning supersedes, ADR-0183 D2's write-lock), and `closed` when it is
 * terminal for ANY reason. Enum-fenced at the schema so a free-prose state can never be written
 * (the FrictionRoute precedent).
 *
 * FOUR values where ADR-0183 D2's `PlanStatus` had five, and the cuts are the decision (ADR-0305 D2,
 * applying ADR-0196 D2's ruling that wide lifecycle enums are surface-level over-engineering):
 *
 * - `draft` is dropped outright — it meant "not safe to consume", which `proposal` also means and
 *   says better, and no consumer ever distinguished a half-authored plan from a deliberately parked
 *   one. `proposal` also absorbs ADR-0298 D1's parked-work entry, returning the word to the STATE it
 *   always was: ADR-0298 retired `proposal` as a competing KIND, and as a status it competes with
 *   nothing — it is always inside an arc by construction.
 * - `consumed` is renamed `active`. The write-lock is unchanged; the name now says what the state is
 *   rather than what was done to it.
 * - `superseded` and `retired` collapse into `closed`. Both were terminal and differed only in WHY
 *   the work stopped — a reason string wearing a state's clothes. The reason lives in the closing
 *   `outcome.note` (ADR-0305 D5), which is what lets a wrong or duplicate entry be closed HONESTLY
 *   instead of being marked landed.
 */
export const IncrementStatus = z.enum(["proposal", "ready", "active", "closed"]);
export type IncrementStatus = z.infer<typeof IncrementStatus>;

/**
 * The stored closure state of an `arc` (ADR-0239 D1): `active` while the initiative is in flight,
 * `closed` once a terminal increment records that the observable `endState` condition was met.
 * TWO values, not the increment tier's four — an arc has no `open` state (ADR-0196 D1's table gives
 * `arc` an `active`/`archived` row only), and D2 of that same ADR already judged the wider enum
 * surface-level over-engineering. Vocabulary follows ADR-0196 D2 verbatim ("a stored `lifecycle`
 * field"), and the mapping onto the universal triad stays in the ONE projection (`lifecycleOf`,
 * ADR-0196 D4). Enum-fenced at the schema so a free-prose state can never be written (the
 * {@link IncrementStatus} precedent).
 */
export const ArcLifecycle = z.enum(["active", "closed"]);
export type ArcLifecycle = z.infer<typeof ArcLifecycle>;

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
// The `open-question` kind (ADR-0267 D4) carries one structured field OUTSIDE its KIND_SPECS body
// table: `arcRef`, the arc the question is waiting on. ADR-0183 D3's containment rule puts the edge
// on the CHILD, so the arc's question view is DERIVED by query — deliberately NOT an authored
// question-list field on the arc, which would need editing every time a question is raised or
// closed (precisely the rot D3 exists to prevent). Mirrors `Increment.arcRef` — same `AssetRef` shape,
// so `doc:`/prose refs still fail closed — but OPTIONAL where the plan's is required: a question can
// be raised before any arc owns it, and every EXISTING open-question doc must still validate. So
// there is NO `CURRENT_SCHEMA_VERSION` bump and zero migration (the `Arc.increments` /
// `Agent.stepRefs` precedent, re-verified against migrations.ts as ADR-0267's Consequences asked:
// all three registered migrations only DROP fields, so each no-ops on a doc without `arcRef`).
// `.extend()` preserves `.strict()` and the `kind` literal, so the discriminated union is unaffected.
export const OpenQuestion = buildKindSchema("open-question").extend({
  arcRef: AssetRef.optional(),
});
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
  // DISCOVERY synonyms for this agent (ADR-0325 D4) — the names a session might reach for when it
  // wants this role but does not know its canonical id (`explorer` ← `scout`, `probe`). The `model`
  // precedent exactly: OPTIONAL schema-level metadata the renderers read into frontmatter, never a
  // KIND_SPECS body section, so it does not round-trip through markdown and every existing agent doc
  // still validates with NO `CURRENT_SCHEMA_VERSION` bump / migration; `.extend()` preserves
  // `.strict()` and the `kind` literal, so the discriminated union is unaffected.
  //
  // An alias is a SYNONYM IN THE INDEX, NOT A SECOND DOOR. It renders into the generated
  // `description` so the agent is findable under either name; the canonical spawn name stays the
  // artifact id, because the harness resolves `subagent_type` by the `name:` frontmatter alone and
  // minting a duplicate agent FILE per alias would add per-session preamble weight to every session
  // (the cost ADR-0323 D3 exists to hold down) purely to save typing.
  aliases: z.array(z.string().min(1)).optional(),
});
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
  // The delivery stamp (the delivery-signal gap): a routed item whose remedy LANDED was
  // indistinguishable from one whose remedy was never built. Optional ref prose (a PR "#1025",
  // an "ADR-0271", an `asset:` id) written by `storytree friction route --discharged-by` — at
  // adjudication when the remedy already landed, or by re-running the route when it lands later.
  // Schema-level metadata like `reinforcedBy`, never a KIND_SPECS body section; optional, so no
  // `CURRENT_SCHEMA_VERSION` bump and zero migration.
  dischargedBy: z.string().min(1).optional(),
});
// The `arc` kind carries exactly ONE structured field outside its KIND_SPECS body table:
// `lifecycle`, the stored closure flag (ADR-0239 D1). Schema-level metadata, never a rendered body
// section, so it does not round-trip through markdown; OPTIONAL-WITH-DEFAULT, so an arc authored
// before the field validates unchanged and reads as in flight. It closes ADR-0196 D2's deferral: the
// arc-close write finally has a field to land in, so the `archived` half of that ADR's arc row stops
// being unreachable by construction.
//
// IT USED TO CARRY THREE (ADR-0305 D1). `increments` (ADR-0183 D1's append-at-landing log) and
// `proposals` (ADR-0298 D1's parked work) are GONE — an arc's work entries are `increment` DOCS
// found the way its plans already were, by query on the child's `arcRef`, so ADR-0183 D3's rule that
// every containment edge lives on the child now holds without exception and the arc row names no
// child at all. That is the fold's whole point: the two arrays had opposite lifecycles and had to be
// kept consistent by hand, and neither could be READ, EDITED or ADDRESSED on its own — an entry was
// an element of an array inside a large document, so the only view of one paragraph was the whole
// initiative. As rows, `library artifact <increment-id> --pg` is the narrow view and `library
// artifact edit` is the correction path, with no new verb for either.
//
// An arc doc is therefore exactly: `intent`, `endState`, `lifecycle`, and the common fields.
//
// ADR-0239 D2's "SINGLE atomic write" for `arc close` does NOT survive this, and that is stated
// rather than quietly dropped: the terminal increment is its own row now, so closing an arc writes
// two. `arcClose` orders them increment-then-flip, so an interrupted close leaves an increment
// without its closure (recoverable, and visibly unclosed) rather than a closure without the prose
// that justifies it (a lie the ADR wrote that invariant to prevent).
//
// `lifecycle` moves in BOTH directions and neither is a bare `--set`: `arcReopen` (ADR-0337) is the
// mirror, ordered the same way for the same reason. ADR-0239 D2 had reserved `closed → active` for
// the owner, but shipped no verb, flag or owner path — so the transition was reachable by nobody,
// and an arc could be left reading `closed` while its own accepted ADR said otherwise.
export const Arc = buildKindSchema("arc").extend({
  lifecycle: ArcLifecycle.default("active"),
});
// The `increment` kind (ADR-0183 D2/D3, folded by ADR-0305 D1) — ONE unit of arc work, from the
// moment it is decided through to the moment it closes. It carries seven structured fields beyond its
// KIND_SPECS body table:
//
// - `arcRef` is REQUIRED — an increment is born citing its arc (ADR-0183 D3: the containment edge
//   lives on the child, and the arc's view of its increments is derived by query, never authored on
//   the arc). This is the field that makes the fold work at all.
// - `anchor` is the git anchor the consumption-time freshness check runs against. OPTIONAL since the
//   fold, where the plan tier had it REQUIRED: an increment now exists from `proposal` onward, and a
//   parked intention has nothing to be anchored to yet — it is anchored when it is planned. An
//   unanchored increment is not silently blessed; `increment check` refuses to freshness-check one.
// - `status` is the enum-fenced lifecycle (ADR-0305 D2), defaulting to `proposal` at birth.
// - `parked` and `frictionRefs` are ADR-0298 D2/D3's delivery-ceiling inputs, moved onto the
//   increment unchanged by ADR-0305 D6 so "how long has this decided-but-unbuilt remedy been
//   waiting" keeps answering, per artifact, exactly as before.
// - `cites` is the typed work-hierarchy edge (ADR-0306 D2) — the stories/capabilities this touches
//   and the guidance it stands on, as pointers that RESOLVE rather than the prose ids
//   `decomposition` carried. Optional and legitimately empty; a dangling ref is reported on read,
//   never refused on write.
// - `outcome` is the closing record (ADR-0305 D5).
//
// Ephemeral (see EPHEMERAL_KINDS): live-store-only. Read that as its LIFECYCLE, not as an exemption —
// ADR-0302 D1/D4 left every kind live-only, so what still marks this one is that it is disposable by
// construction. It is NOT prunable, though, and that half of ADR-0183 D2 is reversed by ADR-0305 D3:
// a closed increment IS the landing-log entry the arc used to copy into `increments[]`, so the log
// survives precisely by nothing deleting the artifact that produced it.
export const Increment = buildKindSchema("increment").extend({
  arcRef: AssetRef,
  anchor: IncrementAnchor.optional(),
  status: IncrementStatus.default("proposal"),
  /**
   * When it was parked (ISO timestamp) — **the delivery ceiling's comparison point** (ADR-0298 D3).
   * Per-INCREMENT rather than per-arc because an arc long outlives any one entry, so the arc's own
   * age says nothing about when this remedy was deferred. Conditionally REQUIRED — see
   * {@link assertIncrementInvariants}.
   */
  parked: z.string().min(1).optional(),
  /**
   * The source friction ids this increment remedies — **the delivery ceiling's join** (ADR-0298 D2).
   * The friction item separately cites the ARC in its `references`, but that citation names only the
   * arc; an arc carries many increments, so it cannot say which one a recurrence presses on.
   */
  frictionRefs: z.array(z.string().min(1)).optional(),
  /**
   * The work-hierarchy units this increment touches and the guidance it stands on (ADR-0306 D2) —
   * a mixed list of `story:` / `capability:` / `asset:` pointers ({@link CiteRef}).
   *
   * It replaces the id-naming half of the `decomposition` field ADR-0305 D4 removed. **A SET, not a
   * sequence**: it carries no order and no proof route, because a flat list cannot honestly express
   * either. Dependency order and per-unit proof route stay in `body` prose, where they already live.
   *
   * OPTIONAL, and legitimately empty. Greenfield work is creating the capability so it cannot cite
   * one, and planning / ADR authoring / arc landings name no capability at all — an increment citing
   * nothing is correct rather than under-specified, and no surface may read an absent `cites` as a
   * defect.
   *
   * **A ref that resolves to nothing is a REPORT, never a write-time rejection** (ADR-0306 D1). The
   * work hierarchy is disk-canonical and BRANCH-DEPENDENT (ADR-0002/0010), so an increment authored
   * against a story that exists only on another branch must be writable — rejecting here would make
   * an increment unwritable on precisely the branch that creates the story it plans. The report is
   * the read surface's: `arc show` flags the dangling refs it can see from this checkout, and
   * `library --check`'s referential-integrity leg lists them as a WARN.
   */
  cites: z.array(CiteRef).optional(),
  /** The landing (or other terminal event) that closed it — absent until it does (ADR-0305 D5). */
  outcome: IncrementOutcome.optional(),
});

/**
 * The two CONDITIONAL invariants on an increment, checked at the write boundary
 * ({@link import("./library-doc.js").validateLibraryDoc}) rather than on the schema.
 *
 * They live here and not as a `.superRefine` for a structural reason, not a stylistic one:
 * {@link Knowledge} is a `z.discriminatedUnion`, whose members must be plain `ZodObject`s. Refining
 * one turns it into a `ZodEffects` and the union stops discriminating — so the choice is between a
 * post-parse assertion and no fence at all. A post-parse assertion is enough because EVERY store
 * write already funnels through `upcastAndValidate`, so there is no path that reaches the database
 * around it.
 *
 * - **`proposal` ⇒ `parked`.** `parked` is what the ADR-0298 D3 ceiling compares a reinforcement
 *   against. A parked increment without it is not merely under-documented — it is unmeasurable, and
 *   it fails OPEN: the ceiling can never red it, so the queue silently stops being drained.
 * - **`closed` ⇒ `outcome`, and a PARKED increment's outcome with no `pr` needs a `note`.** ADR-0305
 *   D2 collapsed `superseded` and `retired` into one terminal state on the grounds that the
 *   difference was a reason, not a state. That trade only holds if the reason is actually written
 *   down: a `closed` increment with neither a landing ref nor a note is exactly the "false landing"
 *   this tier exists to prevent, since a reader cannot tell a shipped increment from an abandoned
 *   one.
 *
 *   **`parked` is the discriminator, and it is what ADR-0322 added.** The rule used to be
 *   unconditional, which quietly forced `arc increment add` to satisfy it by COPYING its `--outcome`
 *   prose into `outcome.note` as well as `body` — two copies of one paragraph, only one of them
 *   reachable by `library artifact edit`, so an ADR-0139 correction half-applied. The reason the
 *   copy was ever needed is that the invariant could not tell the tier's two closures apart:
 *   - An increment that was **parked first** (`parked` stamped by `arc increment new`) has a `body`
 *     that is the INTENTION. Its closure genuinely needs its own prose, so the rule still bites.
 *   - An increment **born closed** (no `parked` — `arc increment add`, the merge ceremony's residue
 *     step) has a `body` that IS the terminal prose, required by the schema and demanded by the verb
 *     as `--outcome`. Its closure can never be unexplained, so the note has nothing left to add.
 *   Validated against the live store on 2026-08-08 before the rule changed: of 460 closed
 *   increments, all 54 carrying a note identical to their body had no `pr` AND no `parked`, and no
 *   parked increment carried such a copy — the discriminator separates the two closures with zero
 *   exceptions.
 *
 * Throws a plain `Error` (never a `ZodError`) — `explainDocValidationError` falls back to the raw
 * message for anything it cannot place, so the text below is what the author sees.
 */
export function assertIncrementInvariants(doc: Increment): void {
  if (doc.status === "proposal" && doc.parked === undefined) {
    throw new Error(
      `increment "${doc.id}" is status "proposal" but carries no \`parked\` timestamp. ` +
        "`parked` is the delivery ceiling's comparison point (ADR-0298 D3 / ADR-0305 D6): without it " +
        "no recurrence can ever be measured against this entry, so it would sit in the queue " +
        "permanently un-drainable. `arc increment new` stamps it from the composition-root clock.",
    );
  }
  if (doc.status === "closed" && doc.outcome === undefined) {
    throw new Error(
      `increment "${doc.id}" is status "closed" but carries no \`outcome\`. ` +
        "A closed increment IS the arc's landing-log entry (ADR-0305 D3/D5) — closing one without " +
        "recording what happened deletes the residue the fold exists to keep. Use `arc increment " +
        "close <id> --pr <ref> --pg`, or `--note` when it closed for any other reason.",
    );
  }
  if (
    doc.outcome !== undefined &&
    doc.outcome.pr === undefined &&
    doc.outcome.note === undefined &&
    doc.parked !== undefined
  ) {
    throw new Error(
      `increment "${doc.id}" was parked, then closed with neither \`outcome.pr\` nor \`outcome.note\`. ` +
        "ADR-0305 D2 removed `superseded` and `retired` as states because the difference between " +
        "them was a REASON, not a state — so the reason has to be written: give the landing ref, or " +
        "say why it closed. An unexplained closure reads as a landing that never happened. " +
        "(A `parked` entry's `body` is the INTENTION, so it cannot double as the closing prose — " +
        "ADR-0322. An increment born closed by `arc increment add` carries the outcome in `body` and " +
        "needs no note.)",
    );
  }
}
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
  Friction,
  Arc,
  Increment,
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
export type Friction = z.infer<typeof Friction>;
export type Arc = z.infer<typeof Arc>;
export type Increment = z.infer<typeof Increment>;
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

/** `schema` with its optional/nullable/default/effects wrappers peeled off. */
function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur: z.ZodTypeAny = schema;
  for (;;) {
    if (cur instanceof z.ZodOptional || cur instanceof z.ZodNullable) {
      cur = cur.unwrap() as z.ZodTypeAny;
    } else if (cur instanceof z.ZodDefault) {
      cur = cur.removeDefault() as z.ZodTypeAny;
    } else if (cur instanceof z.ZodEffects) {
      cur = cur.innerType() as z.ZodTypeAny;
    } else {
      return cur;
    }
  }
}

/** True iff `schema`, after unwrapping optional/nullable/default/effects wrappers, is an array. */
function isArraySchema(schema: z.ZodTypeAny): boolean {
  return unwrapSchema(schema) instanceof z.ZodArray;
}

/**
 * The ARRAY-typed top-level fields of a structured Knowledge kind (`references`, a uat-criterion's
 * `stepRefs`, …), read straight from that kind's schema shape like {@link knownFieldsForKind} —
 * drift-proof, never a hand-maintained list. Null for a non-Knowledge kind.
 *
 * Its reason for existing: a write surface (the CLI's `artifact edit`) can never satisfy an array
 * field with a bare `--set` string — the strict schema rejects it as "Expected array, received
 * string" with no way to write the field at all. Knowing which fields are array-typed lets the
 * surface parse the value (inline or `@file`) as a JSON array on the same validated path, and
 * refuse a non-array value with the expected format named.
 */
export function arrayFieldsForKind(kind: string): ReadonlySet<string> | null {
  const schema = Knowledge.optionsMap.get(kind as KnowledgeKind);
  if (schema === undefined) return null;
  return new Set(
    Object.entries(schema.shape)
      .filter(([, field]) => isArraySchema(field as z.ZodTypeAny))
      .map(([name]) => name),
  );
}

/**
 * The STRING-typed top-level fields of a structured Knowledge kind — every KIND_SPECS prose section
 * plus the string commons (`title`, `description`, `arcRef`, …), read straight from the schema shape
 * like its two neighbours above. Drift-proof, never a hand-maintained list. Null for a non-Knowledge
 * kind.
 *
 * Its reason for existing (`artifact-edit-set-refuses-a-type-mismatched-value`): a `--set` value is
 * ALWAYS a string, so a JSON array sent to a prose field validates perfectly and persists as literal
 * JSON text — exit 0, no warning, and the corruption visible only in the render. Knowing which
 * fields are string-typed lets the write surface refuse that mismatch instead of storing it. The
 * enum-typed fields (a friction's `route`) are deliberately NOT here: their own schema already
 * refuses anything off the closed set.
 */
export function stringFieldsForKind(kind: string): ReadonlySet<string> | null {
  const schema = Knowledge.optionsMap.get(kind as KnowledgeKind);
  if (schema === undefined) return null;
  return new Set(
    Object.entries(schema.shape)
      .filter(([, field]) => unwrapSchema(field as z.ZodTypeAny) instanceof z.ZodString)
      .map(([name]) => name),
  );
}
