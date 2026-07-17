// The Library `template` artifacts — the per-kind authoring scaffolds the studio and CLI offer.
//
// Re-homed here from the retired `apps/studio/data/assets.json` (ADR-0210). Previously these 13 rows
// were the only `template`-category entries in that GENERATED file; every consumer (the corpus
// migration, the desktop seed, the offline studio backend) read them straight out of it. They now
// live in code so no committed generated derivative has to stand in for them.
//
// The 12 SCHEMA-DERIVED templates (`definition` … `plan`) have their BODY generated from
// {@link KIND_SPECS} via {@link generateTemplate} at call time — the ADR-0017 invariant that a
// template is a generated view of the schema, so it can never drift from the field set. Only their
// editorial metadata (title / description / timestamps — none of which derive from the schema) is
// embedded. `template-adr` is the one bespoke literal: it scaffolds a doc under `docs/decisions/`,
// not a knowledge-unit kind, so it has no `KIND_SPECS` entry to generate from.
//
// Order matches the historical assets.json (template-adr sits between techstack and open-question).

import { generateTemplate } from "./knowledge-render.js";
import type { KnowledgeKind } from "./knowledge.js";

/** A generated Library `template` artifact: the scaffold shape offered when authoring a new unit. */
export interface LibraryTemplateAsset {
  readonly id: string;
  readonly category: "template";
  readonly title: string;
  readonly description: string;
  readonly body: string;
  readonly references: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Editorial metadata for a schema-derived template; the body is generated from KIND_SPECS. */
interface GeneratedTemplateMeta {
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const GENERATED_BEFORE_ADR: readonly GeneratedTemplateMeta[] = [
  { kind: "definition", title: "Template — definition", description: "Fillable scaffold for a new definition artifact (what something is).", createdAt: "2026-06-05T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
  { kind: "principle", title: "Template — principle", description: "Fillable scaffold for a new principle artifact (how to judge).", createdAt: "2026-06-05T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
  { kind: "pattern", title: "Template — pattern", description: "Fillable scaffold for a new pattern artifact (a reusable approach).", createdAt: "2026-06-05T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
  { kind: "guardrail", title: "Template — guardrail", description: "Fillable scaffold for a new guardrail artifact — requires an \"Enforced by\" section.", createdAt: "2026-06-05T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
  { kind: "techstack", title: "Template — techstack", description: "Fillable scaffold for a new techstack artifact (what we build on).", createdAt: "2026-06-05T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
];

const TEMPLATE_ADR: LibraryTemplateAsset = {
  id: "template-adr",
  category: "template",
  title: "Template — adr",
  description: "Scaffold for a new ADR under docs/decisions/ — the source layer the knowledge tier derives from (ADR-0017), not a knowledge-unit kind. Section shape: Status / Date / Context / Decision / Consequences / Alternatives considered / References.",
  body: "_Use this to author a new ADR under `docs/decisions/`. ADRs are the **source layer** the knowledge tier derives from (ADR-0017), not a Library knowledge-unit kind — this is the only `template` whose output is a doc, not a `definition` / `principle` / `pattern` / `guardrail` / `techstack` unit._\n\n# ADR-NNNN: <short imperative title>\n\n## Status\n\n_proposed · accepted · superseded by ADR-XXXX_\n\n## Date\n\n_YYYY-MM-DD_\n\n## Context\n\n_The forces at play — what makes this decision necessary now, and the constraints it must satisfy._\n\n## Decision\n\n_What we are doing, stated plainly in the present tense._\n\n## Consequences\n\n_What follows — the trade-offs accepted, the new constraints, what gets easier or harder._\n\n## Alternatives considered\n\n_What else was on the table and why it lost (name both sides of each trade)._\n\n## References\n\n_Source / related ADRs, glossary terms, and Library artifacts._",
  references: [],
  createdAt: "2026-06-05T00:00:00.000Z",
  updatedAt: "2026-06-07T00:00:00.000Z",
};

const GENERATED_AFTER_ADR: readonly GeneratedTemplateMeta[] = [
  { kind: "open-question", title: "Template — open-question", description: "Fillable scaffold for a new open-question artifact (an unresolved decision to settle).", createdAt: "2026-06-07T00:00:00.000Z", updatedAt: "2026-06-07T00:00:00.000Z" },
  { kind: "process", title: "Template — process", description: "Fillable scaffold for a new process artifact (a repeatable operating ceremony).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
  { kind: "agent", title: "Template — agent", description: "Fillable scaffold for a new agent artifact (a role and its operating discipline).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
  { kind: "proposal", title: "Template — proposal", description: "Fillable scaffold for a new proposal artifact (a planned change to roll out when ready).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
  { kind: "friction", title: "Template — friction", description: "Fillable scaffold for a new friction artifact (what fought a session, with evidence).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
  { kind: "arc", title: "Template — arc", description: "Fillable scaffold for a new arc artifact (a multi-story initiative tracked to a closed end-state).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
  { kind: "plan", title: "Template — plan", description: "Fillable scaffold for a new plan artifact (disposable, git-anchored choreography for one arc increment).", createdAt: "2026-06-11T00:00:00.000Z", updatedAt: "2026-06-11T00:00:00.000Z" },
];

/** Render a schema-derived template: editorial metadata + a body generated from KIND_SPECS. */
function render(m: GeneratedTemplateMeta): LibraryTemplateAsset {
  return {
    id: `template-${m.kind}`,
    category: "template",
    title: m.title,
    description: m.description,
    body: generateTemplate(m.kind),
    references: [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * The 13 Library `template` artifacts in canonical order: the 12 schema-derived scaffolds
 * (body generated from {@link KIND_SPECS}) plus the bespoke `template-adr` doc scaffold.
 * The single source the corpus migration, the desktop seed, and the offline studio backend read.
 */
export function libraryTemplates(): LibraryTemplateAsset[] {
  return [...GENERATED_BEFORE_ADR.map(render), TEMPLATE_ADR, ...GENERATED_AFTER_ADR.map(render)];
}
