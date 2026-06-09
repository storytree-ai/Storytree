import { z } from "zod";
import { Markdown } from "./schema.js";

/**
 * The cross-cutting knowledge tier (ADR-0017), encoded as a schema.
 *
 * A knowledge unit is a curated markdown body whose structure is fixed per kind
 * (definition / principle / pattern / guardrail / techstack / open-question). Round-1
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
}

export type KnowledgeKind =
  | "definition"
  | "principle"
  | "pattern"
  | "guardrail"
  | "techstack"
  | "open-question";

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
  references: z.array(z.string()).default([]),
  provenance: Markdown.optional(),
  glossarySection: z.string().optional(),
  glossaryTerm: z.string().optional(),
  glossaryBody: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
} as const;

/**
 * Build a per-kind zod object from its field spec table. Required fields are `Markdown`;
 * optional fields are `Markdown.optional()`. The `kind` literal discriminates the union.
 * The glossary-projection metadata (`glossarySection` / `glossaryTerm`) lives in
 * {@link commonShape}, so every kind may carry it.
 */
function buildKindSchema(kind: KnowledgeKind) {
  const fieldShape: Record<string, z.ZodTypeAny> = {};
  for (const spec of KIND_SPECS[kind]) {
    fieldShape[spec.field] = spec.required ? Markdown : Markdown.optional();
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
export const OpenQuestion = buildKindSchema("open-question");

/** A knowledge unit at any kind. The discriminator is `kind` (ADR-0017). */
export const Knowledge = z.discriminatedUnion("kind", [
  Definition,
  Principle,
  Pattern,
  Guardrail,
  TechStack,
  OpenQuestion,
]);

export type Knowledge = z.infer<typeof Knowledge>;
export type Definition = z.infer<typeof Definition>;
export type Principle = z.infer<typeof Principle>;
export type Pattern = z.infer<typeof Pattern>;
export type Guardrail = z.infer<typeof Guardrail>;
export type TechStack = z.infer<typeof TechStack>;
export type OpenQuestion = z.infer<typeof OpenQuestion>;
