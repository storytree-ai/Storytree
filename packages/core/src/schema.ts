import { z } from "zod";

/**
 * The work-hierarchy schema (ADR-0002 / ADR-0010), encoded as the corpus's
 * source-of-truth validator (ADR-0013).
 *
 * Principle (ADR-0013, owner 2026-06-06): a unit is structured data (on disk the units are
 * frontmatter-markdown; the structured corpus source format is JSON — ADR-0039). Context is a
 * first-class input/signal, so narrative is NOT a freeform body — it lives in typed,
 * addressable fields (`guidance[]`, walkthrough `steps[]`, `proof_note`). Decompose only
 * where granular pull/query/validate pays; long-form prose stays a single field. Text lives
 * at the LEAVES as markdown-formatted values the UI renders — never a document body.
 */

/**
 * A prose field: markdown-formatted text, rendered by the UI. A *value type*, not a
 * document container (ADR-0013 §3). Non-empty so an empty string can't masquerade as prose.
 */
export const Markdown = z.string().min(1);

export const Tier = z.enum(["story", "capability", "contract"]);
export const Status = z.enum([
  "proposed",
  "building",
  "healthy",
  "unhealthy",
  "mapped",
  "retired",
]);

/** A structured pointer into real source — validatable (the file/line can be checked). */
export const Covers = z
  .object({
    file: z.string(), // repo-relative path, e.g. apps/studio/src/components/Library.tsx
    lines: z.string(), // e.g. "16-17" or "15,18-20"
  })
  .strict();

/**
 * A discrete, addressable guidance note — the granular unit the context engine pulls
 * per-step (ADR-0011). `note` is markdown prose; everything around it is structured.
 */
export const Guidance = z
  .object({
    id: z.string().optional(),
    scope: z
      .object({
        contract: z.string().optional(),
        edge: z.string().optional(),
      })
      .strict()
      .optional(),
    note: Markdown,
  })
  .strict();

/** One step of a proof walkthrough: an action and the success criterion that proves it. */
export const Step = z
  .object({
    action: Markdown,
    success: Markdown,
  })
  .strict();

/** A proof walkthrough — a story's UAT or a capability's integration test. */
export const Walkthrough = z
  .object({
    goal: Markdown,
    steps: z.array(Step).min(1),
  })
  .strict();

/** A test-proven leaf behaviour within a capability (the contract tier as a sub-record). */
export const Contract = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    asserts: Markdown,
    covers: Covers,
  })
  .strict();

/** A code-derived in-story dependency edge (ADR-0010 §3); rationale is structured, optional. */
export const Edge = z
  .object({
    from: z.string(),
    to: z.string(),
    rationale: Markdown.optional(),
  })
  .strict();

/** Who witnesses a story's UAT (ADR-0040): the operator, or the machine gate. */
export const UatWitness = z.enum(["human", "machine"]);
export type UatWitness = z.infer<typeof UatWitness>;

/**
 * The effective witness for a story's UAT: absent = `human` — fail-closed toward requiring the
 * operator (ADR-0040). THE one defaulting seam; both the story-build gate and the studio tree
 * payload resolve through it, so the default can never fork.
 */
export function effectiveUatWitness(declared: UatWitness | undefined): UatWitness {
  return declared ?? "human";
}

const base = {
  id: z.string(),
  title: z.string(),
  outcome: z.string(), // single-sentence value statement (glossary: `outcome`)
  status: Status,
  proof_note: Markdown.optional(), // honest proof caveat — a typed prose field, not a body
} as const;

export const Story = z
  .object({
    tier: z.literal("story"),
    ...base,
    proof_mode: z.enum(["UAT", "operator-attested"]),
    uat_witness: UatWitness.optional(), // who witnesses the UAT; absent = human (ADR-0040)
    capabilities: z.array(z.string()),
    decisions: z.array(z.number().int().positive()).default([]), // deciding ADR numbers (ADR-0037 §2)
    edges: z.array(Edge).default([]), // the within-story code-derived graph (ADR-0010 §3)
    uat: Walkthrough,
    framing: Markdown.optional(),
  })
  .strict();

export const Capability = z
  .object({
    tier: z.literal("capability"),
    ...base,
    story: z.string(),
    proof_mode: z.enum(["integration-test", "operator-attested"]),
    depends_on: z.array(z.string()).default([]), // code-derived in-story edges (ids)
    guidance: z.array(Guidance).default([]),
    integration_test: Walkthrough,
    contracts: z.array(Contract).min(1),
  })
  .strict();

export const ContractUnit = z
  .object({
    tier: z.literal("contract"),
    ...base,
    capability: z.string(),
    proof_mode: z.enum(["contract-test", "operator-attested"]),
    asserts: Markdown,
    covers: Covers,
  })
  .strict();

/** A corpus unit at any tier. The discriminator is `tier` (ADR-0002). */
export const Unit = z.discriminatedUnion("tier", [Story, Capability, ContractUnit]);

export type Unit = z.infer<typeof Unit>;
export type Story = z.infer<typeof Story>;
export type Capability = z.infer<typeof Capability>;
export type ContractUnit = z.infer<typeof ContractUnit>;
