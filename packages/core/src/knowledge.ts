import { z } from "zod";
import { Markdown } from "@storytree/library";

/**
 * The cross-cutting knowledge tier (ADR-0017), encoded as a schema.
 *
 * A knowledge unit is a curated markdown body whose structure is fixed per kind
 * (definition / principle / pattern / guardrail / techstack / process / open-question / agent).
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
  | "proposal";

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
        "_Which surfaces this touches — tree, noticeboard, library, repo/CI — and what it reads or writes on each._",
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
        "_A picture when the subject is a structure, flow, or state machine — an ASCII box/flow diagram in a fenced code block. Omit for a pure value/policy choice._",
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
} as const;

/**
 * Fields shared by every knowledge kind. Mirrors the runtime-store JSON shape (the `kind`
 * discriminator maps from the source `category` key elsewhere; here it is `kind`).
 *
 * `references` are `doc:<relpath>` / `asset:<id>` pointers — the SINGLE citation source, rendered
 * grouped-by-type as "Sources" ({@link groupSources}). `provenance` is the optional attribution
 * line (markdown) shown under Sources for prose a bare pointer can't carry.
 *
 * `glossarySection`, `glossaryTerm` and `glossaryBody` are GLOSSARY-PROJECTION METADATA,
 * carried by any kind (not just `definition`): a unit is a glossary member iff it has
 * `glossarySection` (the `docs/glossary.md` `## ` heading it sits under), `glossaryTerm` is the
 * exact label MARKUP to print when it differs from the default `**title**` — including its own
 * `**…**` markers and any plain-text aside outside the bold (e.g.
 * `**run** (owned-loop run / attempt)`, `**proof mode**`) — and `glossaryBody` is the term's
 * canonical glossary paragraph, stored VERBATIM (the exact prose after `**label** — ` in
 * `docs/glossary.md`, preserving all markdown/citations/clauses). It is intentionally distinct
 * from the Library body fields (whatItIs/whatItIsNot/description, …): the glossary blurb is the
 * authoritative source line, so `glossaryTerm + " — " + glossaryBody` reproduces it byte-for-byte.
 * All three are METADATA only: they are NOT in KIND_SPECS, so `renderBody`/`generateTemplate`
 * never emit them — the rendered asset bodies stay byte-identical. See
 * apps/studio/data/build-corpus.mjs (the glossary generator).
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
  glossarySection: z.string().optional(),
  glossaryTerm: z.string().optional(),
  glossaryBody: z.string().optional(),
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
 * Build a per-kind zod object from its field spec table. Required fields are `Markdown`;
 * optional fields are `Markdown.optional()`; `refList` fields are `asset:` ref arrays
 * (required => non-empty). The `kind` literal discriminates the union.
 * The glossary-projection metadata (`glossarySection` / `glossaryTerm`) lives in
 * {@link commonShape}, so every kind may carry it.
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
export const Process = buildKindSchema("process");
export const OpenQuestion = buildKindSchema("open-question");
export const Agent = buildKindSchema("agent");
export const Proposal = buildKindSchema("proposal");

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
